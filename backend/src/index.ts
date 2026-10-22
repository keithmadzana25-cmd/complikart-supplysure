import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import type { PoolClient } from "pg";
import { promisify } from "node:util";
import { z } from "zod";
import { pool } from "./db.js";
import { generateLabel, labelRequestSchema, normalizeGtin } from "./labels.js";
import { buildEpcisDocument, bizStepFor, EVENT_TYPES, type CompliKartEventType } from "./epcis.js";

type AuthRequest = Request & { userId?: string };
type PublicUser = { id: string; name: string; email: string; license_type: string };
const scrypt = promisify(scryptCallback);
const app = express();
app.disable("x-powered-by");
app.use((_request, response, next) => {
  const id = randomUUID();
  response.locals.correlationId = id;
  response.setHeader("x-correlation-id", id);
  next();
});
app.use(express.json({ limit: "1mb" }));

function fail(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message, correlationId: response.locals.correlationId } });
}

const authLimiter = rateLimit({ windowMs: 3_600_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 3_600_000, limit: 100, standardHeaders: true, legacyHeaders: false });
function authenticate(request: AuthRequest, response: Response, next: (error?: unknown) => void): void {
  const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) {
    fail(response, token ? 503 : 401, token ? "AUTH_NOT_CONFIGURED" : "UNAUTHORIZED", token ? "Authentication is not configured." : "A bearer token is required.");
    return;
  }
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string" || typeof payload.sub !== "string") throw new Error("Invalid token subject");
    request.userId = payload.sub;
    next();
  } catch {
    fail(response, 401, "INVALID_TOKEN", "The bearer token is invalid or expired.");
  }
}

app.get("/health", (_request, response) => response.json({ status: "ok", service: "backend" }));

const registration = z.object({
  name: z.string().trim().min(1).max(200), phone: z.string().trim().min(8).max(20),
  email: z.string().trim().email().max(254), password: z.string().min(10).max(128),
  fssai_license_number: z.string().trim().min(1).max(100),
  license_type: z.string().trim().min(1).max(100), turnover: z.number().nonnegative(),
});
const loginSchema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) });
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = stored.split(":");
  if (algorithm !== "scrypt" || !saltHex || !hashHex || !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length) as Buffer;
  return timingSafeEqual(actual, expected);
}
function issueSession(response: Response, user: PublicUser): void {
  const secret = process.env.JWT_SECRET;
  if (!secret) { fail(response, 503, "AUTH_NOT_CONFIGURED", "Account token signing is not configured."); return; }
  response.json({ data: { token: jwt.sign({}, secret, { subject: user.id, expiresIn: "12h" }), user: { id: user.id, name: user.name, email: user.email, licenseType: user.license_type } } });
}
app.post("/api/auth/register", authLimiter, async (request, response, next) => {
  const parsed = registration.safeParse(request.body);
  if (!parsed.success) { fail(response, 400, "VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")); return; }
  try {
    const { name, phone, email, password, fssai_license_number, license_type, turnover } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const normalizedPhone = phone.replace(/[\s()-]/g, "");
    const passwordHash = await hashPassword(password);
    const inserted = await pool.query<PublicUser>("INSERT INTO users (name, phone, email, fssai_license_number, license_type, turnover, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, license_type", [name, normalizedPhone, normalizedEmail, fssai_license_number, license_type, turnover, passwordHash]);
    const user = inserted.rows[0];
    if (!user) throw new Error("No user returned after registration");
    response.status(201);
    issueSession(response, user);
  } catch (error) { next(error); }
});
app.post("/api/auth/login", authLimiter, async (request, response, next) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) { fail(response, 400, "VALIDATION_ERROR", "Enter your email or phone number and password."); return; }
  try {
    const identifier = parsed.data.identifier.toLowerCase().replace(/[\s()-]/g, "");
    const result = await pool.query<PublicUser & { password_hash: string | null }>("SELECT id, name, email, license_type, password_hash FROM users WHERE lower(email) = $1 OR regexp_replace(phone, '[\\s()-]', '', 'g') = $1 LIMIT 1", [identifier]);
    const user = result.rows[0];
    if (!user?.password_hash || !(await verifyPassword(parsed.data.password, user.password_hash))) { fail(response, 401, "INVALID_CREDENTIALS", "Email/phone or password is incorrect."); return; }
    issueSession(response, user);
  } catch (error) { next(error); }
});

app.use("/api", apiLimiter, authenticate);

app.get("/api/auth/me", async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query<PublicUser>("SELECT id, name, email, license_type FROM users WHERE id = $1", [request.userId]);
    const user = result.rows[0];
    if (!user) { fail(response, 404, "USER_NOT_FOUND", "User account was not found."); return; }
    response.json({ data: { user: { id: user.id, name: user.name, email: user.email, licenseType: user.license_type } } });
  } catch (error) { next(error); }
});

app.get("/api/compliance/status", async (request: AuthRequest, response, next) => {
  try {
    const user = await pool.query<{ license_type: string }>("SELECT license_type FROM users WHERE id = $1", [request.userId]);
    if (!user.rowCount) { fail(response, 404, "USER_NOT_FOUND", "User account was not found."); return; }
    const products = await pool.query("SELECT id, name, category FROM products WHERE user_id = $1 ORDER BY name", [request.userId]);
    response.json({ data: { licenseType: user.rows[0]?.license_type, products: products.rows, roadmap: [], status: "assessment_required", message: "A source-verified regulatory ruleset is required before producing a compliance roadmap." } });
  } catch (error) { next(error); }
});

app.post("/api/labels/generate", async (request: AuthRequest, response, next) => {
  const parsed = labelRequestSchema.safeParse(request.body);
  if (!parsed.success) { fail(response, 400, "VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")); return; }
  let gtin: string;
  try { gtin = normalizeGtin(parsed.data.gtin); }
  catch (error) { fail(response, 400, "INVALID_GTIN", error instanceof Error ? error.message : "GTIN is invalid."); return; }
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const contextResult = await client.query<{
      product_id: string; product_name: string; category: string; product_gtin: string | null;
      batch_id: string | null; batch_code: string | null; manufacturing_date: string | null;
      best_before_date: string | null; storage_conditions: string | null;
      brand_owner_name: string; fssai_license_number: string;
    }>(
      `SELECT p.id AS product_id, p.name AS product_name, p.category, p.gtin AS product_gtin,
              b.id AS batch_id, b.batch_code, b.manufacturing_date, b.best_before_date, b.storage_conditions,
              u.name AS brand_owner_name, u.fssai_license_number
       FROM products p JOIN users u ON u.id = p.user_id
       LEFT JOIN batches b ON b.product_id = p.id AND b.id = $3
       WHERE p.id = $1 AND p.user_id = $2
       FOR UPDATE OF p`,
      [parsed.data.productId, request.userId, parsed.data.batchId],
    );
    const contextRow = contextResult.rows[0];
    if (!contextRow) { await client.query("ROLLBACK"); fail(response, 404, "PRODUCT_NOT_FOUND", "Product was not found for this account."); return; }
    if (!contextRow.batch_id || !contextRow.batch_code || !contextRow.manufacturing_date || !contextRow.best_before_date) {
      await client.query("ROLLBACK"); fail(response, 404, "BATCH_NOT_FOUND", "Batch was not found for this product."); return;
    }
    const manufacturingDate = String(contextRow.manufacturing_date).slice(0, 10);
    if (parsed.data.expiryUseByDate && parsed.data.expiryUseByDate < manufacturingDate) {
      await client.query("ROLLBACK"); fail(response, 400, "INVALID_DATES", "Expiry/Use By date must not precede the manufacturing date."); return;
    }
    if (contextRow.product_gtin && contextRow.product_gtin.trim() !== gtin) {
      await client.query("ROLLBACK"); fail(response, 409, "GTIN_MISMATCH", "The supplied GTIN differs from the one already assigned to this product."); return;
    }
    if (!contextRow.product_gtin) await client.query("UPDATE products SET gtin = $1 WHERE id = $2", [gtin, parsed.data.productId]);
    const context = {
      product: { id: contextRow.product_id, name: contextRow.product_name, category: contextRow.category, gtin: gtin },
      batch: {
        id: contextRow.batch_id,
        batchCode: contextRow.batch_code,
        manufacturingDate,
        bestBeforeDate: String(contextRow.best_before_date).slice(0, 10),
        storageConditions: contextRow.storage_conditions ?? "",
      },
      brandOwner: { name: contextRow.brand_owner_name, fssaiLicenseNumber: contextRow.fssai_license_number },
    };
    const generated = await generateLabel(parsed.data, context);
    const versionResult = await client.query<{ next_version: number }>("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM labels WHERE product_id = $1", [parsed.data.productId]);
    const version = versionResult.rows[0]?.next_version ?? 1;
    const saved = await client.query<{ id: string; generated_at: Date }>(
      "INSERT INTO labels (product_id, label_json, qr_code_url, version) VALUES ($1, $2, $3, $4) RETURNING id, generated_at",
      [parsed.data.productId, generated.label, generated.digitalLinkUri, version],
    );
    await client.query("COMMIT");
    response.status(201).json({
      data: { ...saved.rows[0], productId: parsed.data.productId, batchId: parsed.data.batchId, version, label: generated.label, qrCodeDataUrl: generated.qrCodeDataUrl },
      reviewRequired: true,
      warnings: generated.warnings,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    next(error);
  } finally { client?.release(); }
});

app.post("/api/batches/create", async (request: AuthRequest, response, next) => {
  const schema = z.object({ productId: z.string().uuid(), manufacturingDate: z.string().date(), bestBeforeDate: z.string().date(), quantityProduced: z.number().positive(), storageConditions: z.string().trim().min(1).max(2000) });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) { fail(response, 400, "VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")); return; }
  if (parsed.data.bestBeforeDate < parsed.data.manufacturingDate) { fail(response, 400, "INVALID_DATES", "Best-before date must not precede manufacturing date."); return; }
  try {
    const owns = await pool.query("SELECT 1 FROM products WHERE id = $1 AND user_id = $2", [parsed.data.productId, request.userId]);
    if (!owns.rowCount) { fail(response, 404, "PRODUCT_NOT_FOUND", "Product was not found for this account."); return; }
    const batchCode = `CK-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const saved = await pool.query("INSERT INTO batches (product_id, batch_code, manufacturing_date, best_before_date, quantity_produced, storage_conditions) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *", [parsed.data.productId, batchCode, parsed.data.manufacturingDate, parsed.data.bestBeforeDate, parsed.data.quantityProduced, parsed.data.storageConditions]);
    response.status(201).json({ data: saved.rows[0] });
  } catch (error) { next(error); }
});

app.post("/api/events/record", async (request: AuthRequest, response, next) => {
  const quantityLine = z.object({ gtin: z.string().regex(/^(\d{8}|\d{12}|\d{13}|\d{14})$/), lot: z.string().trim().min(1).max(80), quantity: z.number().positive(), uom: z.string().regex(/^[A-Z]{2,3}$/).optional() });
  const schema = z.object({ batchId: z.string().uuid(), eventType: z.enum(EVENT_TYPES), eventTimestamp: z.string().datetime({ offset: true }), locationGln: z.string().regex(/^\d{13}$/).optional(), partyGln: z.string().regex(/^\d{13}$/).optional(), quantity: z.number().nonnegative().optional(), quantityUom: z.string().regex(/^[A-Z]{2,3}$/).optional(), referenceDocumentUrl: z.string().url().optional(), inputQuantityList: z.array(quantityLine).min(1).optional(), outputQuantityList: z.array(quantityLine).min(1).optional() }).superRefine((value, context) => {
    if (value.eventType === "transformation" && (!value.inputQuantityList?.length || !value.outputQuantityList?.length)) context.addIssue({ code: "custom", path: ["inputQuantityList"], message: "Transformation events require both inputQuantityList and outputQuantityList." });
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) { fail(response, 400, "VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")); return; }
  const normalizeLines = (lines: typeof parsed.data.inputQuantityList) => lines?.map((line) => ({ ...line, gtin: normalizeGtin(line.gtin) }));
  let normalizedInputs: ReturnType<typeof normalizeLines>;
  let normalizedOutputs: ReturnType<typeof normalizeLines>;
  try {
    normalizedInputs = normalizeLines(parsed.data.inputQuantityList);
    normalizedOutputs = normalizeLines(parsed.data.outputQuantityList);
  } catch {
    const invalid = [...(parsed.data.inputQuantityList ?? []), ...(parsed.data.outputQuantityList ?? [])].find((line) => { try { normalizeGtin(line.gtin); return false; } catch { return true; } });
    if (invalid) { fail(response, 400, "INVALID_GTIN", `Transformation GTIN ${invalid.gtin} has an invalid check digit.`); return; }
  }
  try {
    const owns = await pool.query<{ gtin: string | null; batch_code: string }>("SELECT p.gtin, b.batch_code FROM batches b JOIN products p ON p.id = b.product_id WHERE b.id = $1 AND p.user_id = $2", [parsed.data.batchId, request.userId]);
    const product = owns.rows[0];
    if (!product) { fail(response, 404, "BATCH_NOT_FOUND", "Batch was not found for this account."); return; }
    if (!product.gtin) { fail(response, 422, "GTIN_REQUIRED", "Assign a valid GTIN to the product before recording an EPCIS traceability event."); return; }
    let eventId = randomUUID();
    const epcisEvent = buildEpcisDocument({ id: eventId, eventType: parsed.data.eventType as CompliKartEventType, eventTimestamp: parsed.data.eventTimestamp, ...(parsed.data.locationGln ? { locationGln: parsed.data.locationGln } : {}), ...(parsed.data.partyGln ? { partyGln: parsed.data.partyGln } : {}), gtin: product.gtin, batchCode: product.batch_code, ...(parsed.data.quantity === undefined ? {} : { quantity: parsed.data.quantity }), ...(parsed.data.quantityUom ? { quantityUom: parsed.data.quantityUom } : {}), ...(parsed.data.referenceDocumentUrl ? { referenceDocumentUrl: parsed.data.referenceDocumentUrl } : {}), ...(normalizedInputs ? { inputQuantityList: normalizedInputs } : {}), ...(normalizedOutputs ? { outputQuantityList: normalizedOutputs } : {}) });
    const event = await pool.query("INSERT INTO compliance_events (id, batch_id, event_type, event_timestamp, location_gln, party_gln, quantity, reference_document_url, epcis_event_json, gtin, quantity_uom, biz_step, retention_until) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $4::timestamptz + INTERVAL '2 years') RETURNING *", [eventId, parsed.data.batchId, parsed.data.eventType, parsed.data.eventTimestamp, parsed.data.locationGln ?? null, parsed.data.partyGln ?? null, parsed.data.quantity ?? null, parsed.data.referenceDocumentUrl ?? null, epcisEvent, product.gtin, parsed.data.quantityUom ?? null, bizStepFor(parsed.data.eventType)]);
    response.status(201).json({ data: event.rows[0], epcisStatus: "serialized", epcis: epcisEvent });
  } catch (error) { next(error); }
});

app.get("/api/traceability/:batch_code", async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query("SELECT b.*, p.name AS product_name, p.category, e.id AS event_id, e.event_type, e.event_timestamp, e.location_gln, e.party_gln, e.quantity, e.quantity_uom, e.reference_document_url, e.gtin, e.biz_step, e.epcis_event_json, e.retention_until FROM batches b JOIN products p ON p.id = b.product_id LEFT JOIN compliance_events e ON e.batch_id = b.id WHERE b.batch_code = $1 AND p.user_id = $2 ORDER BY e.event_timestamp ASC NULLS LAST", [request.params.batch_code, request.userId]);
    if (!result.rowCount) { fail(response, 404, "BATCH_NOT_FOUND", "Batch was not found for this account."); return; }
    const first = result.rows[0] as Record<string, unknown>;
    const events = result.rows.filter((row) => row.event_id).map((row) => ({ id: row.event_id, eventType: row.event_type, eventTimestamp: row.event_timestamp, locationGln: row.location_gln, partyGln: row.party_gln, gtin: row.gtin, quantity: row.quantity, quantityUom: row.quantity_uom, bizStep: row.biz_step, referenceDocumentUrl: row.reference_document_url, retentionUntil: row.retention_until, epcis: row.epcis_event_json }));
    response.json({ data: { batch: { id: first.id, batchCode: first.batch_code, productId: first.product_id, productName: first.product_name, category: first.category, manufacturingDate: first.manufacturing_date, bestBeforeDate: first.best_before_date, quantityProduced: first.quantity_produced, storageConditions: first.storage_conditions }, events } });
  } catch (error) { next(error); }
});

app.get("/api/compliance/report", async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query("SELECT u.name, u.fssai_license_number, u.license_type, p.name AS product_name, p.category, b.batch_code, b.manufacturing_date, b.best_before_date, count(e.id)::int AS event_count FROM users u LEFT JOIN products p ON p.user_id = u.id LEFT JOIN batches b ON b.product_id = p.id LEFT JOIN compliance_events e ON e.batch_id = b.id WHERE u.id = $1 GROUP BY u.name, u.fssai_license_number, u.license_type, p.id, p.name, p.category, b.id, b.batch_code, b.manufacturing_date, b.best_before_date ORDER BY p.name, b.manufacturing_date", [request.userId]);
    if (!result.rowCount) { fail(response, 404, "USER_NOT_FOUND", "User account was not found."); return; }
    response.json({ data: { generatedAt: new Date().toISOString(), records: result.rows, submissionReady: false, message: "This export has not been validated as an official regulatory submission format." } });
  } catch (error) { next(error); }
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(JSON.stringify({ correlationId: response.locals.correlationId, message: error instanceof Error ? error.message : "Unknown error" }));
  if (error instanceof SyntaxError) { fail(response, 400, "INVALID_JSON", "Request body must contain valid JSON."); return; }
  if ((error as { code?: string }).code === "23505") { fail(response, 409, "CONFLICT", "A record with the same unique value already exists."); return; }
  fail(response, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
};
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
async function start(): Promise<void> {
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users (phone)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (lower(email)) WHERE email IS NOT NULL");
  app.listen(port, () => console.info(`Backend listening on ${port}`));
}
start().catch((error: unknown) => {
  console.error("Backend startup failed", error);
  process.exitCode = 1;
});
