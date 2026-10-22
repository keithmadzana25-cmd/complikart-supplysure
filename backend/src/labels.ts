import QRCode from "qrcode";
import { z } from "zod";

const sourceUrl = "https://www.fssai.gov.in/upload/uploadfiles/files/Comp_Labelling%20Display_Version%20VIII_09_09_2025.pdf";

export const labelRequestSchema = z.object({
  productId: z.string().uuid(),
  batchId: z.string().uuid(),
  gtin: z.string().regex(/^\d{8}$|^\d{12,14}$/, "GTIN must contain 8, 12, 13, or 14 digits."),
  trueNatureOfFood: z.string().trim().min(1).max(300),
  ingredients: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    amountAtManufacture: z.number().positive(),
    unit: z.enum(["g", "ml"]),
  })).min(1).max(100),
  manufacturer: z.object({
    name: z.string().trim().min(1).max(250),
    completeAddress: z.string().trim().min(1).max(1000),
    consumerCareEmail: z.string().email().optional(),
    consumerCarePhone: z.string().trim().min(5).max(30).optional(),
  }),
  brandOwnerAddress: z.string().trim().min(1).max(1000),
  netQuantity: z.object({ value: z.number().positive(), unit: z.enum(["g", "kg", "ml", "L", "count"]) }),
  nutritionInformation: z.record(z.unknown()),
  expiryUseByDate: z.string().date().optional(),
  fssaiLogoAssetUrl: z.string().url().optional(),
  manufacturerLicenseNumber: z.string().trim().min(1).max(100).optional(),
  vegetarianMark: z.enum(["vegetarian", "non_vegetarian"]).optional(),
  allergenDeclaration: z.string().trim().max(1000).optional(),
  coffeeChicoryComposition: z.object({
    coffeePercent: z.number().min(0).max(100),
    chicoryPercent: z.number().min(0).max(100),
    instant: z.boolean().default(false),
  }).optional(),
  storageInstructions: z.string().trim().max(1000).optional(),
  retailSalePrice: z.string().trim().max(100).optional(),
  additionalDeclarations: z.array(z.object({ text: z.string().trim().min(1).max(1000), regulationReference: z.string().trim().max(200).optional() })).optional(),
});

export type LabelRequest = z.infer<typeof labelRequestSchema>;

export type LabelContext = {
  product: { id: string; name: string; category: string; gtin: string | null };
  batch: { id: string; batchCode: string; manufacturingDate: string; bestBeforeDate: string; storageConditions: string };
  brandOwner: { name: string; fssaiLicenseNumber: string };
};

const citations = {
  trueNatureOfFood: { clause: "Regulation 5(1)", sourceUrl },
  ingredients: { clause: "Regulation 5(2)", sourceUrl },
  nutritionInformation: { clause: "Regulation 5(3)", sourceUrl },
  vegetarianMark: { clause: "Regulation 5(4)", sourceUrl },
  manufacturer: { clause: "Regulation 5(6)", sourceUrl },
  fssaiLogoAndLicense: { clause: "Regulation 5(7)(b)", sourceUrl },
  netQuantity: { clause: "Regulation 5(8); Legal Metrology requirements also apply", sourceUrl },
  batchCode: { clause: "Regulation 5(9)", sourceUrl },
  dates: { clause: "Regulation 5(10)", sourceUrl },
  allergens: { clause: "Regulation 5(14)", sourceUrl },
};

/** Validate a GTIN check digit and return the canonical 14-digit primary key. */
export function normalizeGtin(value: string): string {
  const padded = value.padStart(14, "0");
  const digits = [...padded].map(Number);
  const suppliedCheckDigit = digits.pop();
  const weightedSum = digits.reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0);
  const expectedCheckDigit = (10 - (weightedSum % 10)) % 10;
  if (suppliedCheckDigit !== expectedCheckDigit) throw new Error("GTIN check digit is invalid.");
  return padded;
}

/** Generate a draft FSSAI label payload and a QR image encoding its GS1 Digital Link. */
export async function generateLabel(input: LabelRequest, context: LabelContext): Promise<{ label: Record<string, unknown>; digitalLinkUri: string; qrCodeDataUrl: string; warnings: string[] }> {
  const gtin = normalizeGtin(input.gtin);
  if (input.coffeeChicoryComposition && Math.abs(input.coffeeChicoryComposition.coffeePercent + input.coffeeChicoryComposition.chicoryPercent - 100) > 0.01) {
    throw new Error("Coffee and chicory percentages must total 100.");
  }
  const ingredientUnits = new Set(input.ingredients.map((ingredient) => ingredient.unit));
  if (ingredientUnits.size > 1) throw new Error("Ingredient composition must use one common weight or volume unit.");
  const ingredients = [...input.ingredients]
    .sort((left, right) => right.amountAtManufacture - left.amountAtManufacture)
    .map((ingredient) => ingredient.name);
  const bestBefore = context.batch.bestBeforeDate.replaceAll("-", "").slice(2);
  // GS1 Digital Link: GTIN (AI 01), batch/lot (AI 10), best-before date (AI 15).
  const digitalLinkUri = `https://id.gs1.org/01/${gtin}/10/${encodeURIComponent(context.batch.batchCode)}?15=${bestBefore}`;
  const qrCodeDataUrl = await QRCode.toDataURL(digitalLinkUri, { errorCorrectionLevel: "Q", margin: 2, width: 512 });

  const warnings = [
    "Draft only: product category rules, exemptions, claims, declaration sizing and final print layout need qualified review.",
    "Nutrient emphasis is included as a presentation preference from the project brief; this generator does not attest that emphasis is currently required by an effective FSSAI clause.",
    "Net quantity, retail sale price and consumer-care presentation also depend on Legal Metrology requirements.",
  ];
  const requiredNutritionValues = ["energyKcal", "proteinG", "carbohydrateG", "totalSugarsG", "addedSugarsG", "totalFatG", "saturatedFatG", "transFatG", "sodiumMg"];
  const missingNutritionValues = requiredNutritionValues.filter((key) => typeof input.nutritionInformation[key] !== "number");
  if (missingNutritionValues.length) warnings.push(`Nutrition values missing or unverified: ${missingNutritionValues.join(", ")}. Confirm applicable exemptions before printing.`);
  if (!input.nutritionInformation.perServeRdaPercent) warnings.push("Per-serve RDA percentages were not supplied; confirm which declarations apply to this product.");
  if (!input.expiryUseByDate) warnings.push("No separate Expiry/Use By date was supplied. The batch Best Before date is not treated as an Expiry/Use By date; confirm the applicable date marking or an exemption.");
  if (!input.fssaiLogoAssetUrl) warnings.push("FSSAI logo artwork was not supplied; add the approved artwork to the print layout.");
  if (!input.vegetarianMark) warnings.push("Vegetarian/non-vegetarian declaration was not supplied; confirm applicability and value.");
  if (!input.allergenDeclaration) warnings.push("Allergen declaration needs product-specific review, including cross-contamination controls.");
  if (!input.manufacturer.consumerCareEmail && !input.manufacturer.consumerCarePhone) warnings.push("Consumer-care contact details were not supplied.");
  if (!input.manufacturerLicenseNumber) warnings.push("No separate manufacturer license number was supplied; confirm whether it differs from the brand owner license.");
  if (/coffee.?chicory|chicory.?coffee/i.test(context.product.category) && !input.coffeeChicoryComposition) {
    warnings.push("Coffee-chicory composition is not supplied. The category-specific front-of-pack declaration effective from 1 July 2026 needs review.");
  }

  const coffeeChicoryReference = {
    clause: "Schedule II, paragraph 2.2 (Coffee-Chicory Mixture), as amended 8 August 2025; effective 1 July 2026",
    sourceUrl: "https://www.fssai.gov.in/upload/notifications/2025/08/689d8d163d422coffee%20chicory_gazette.pdf",
  };
  const coffeeChicoryFrontDeclaration = input.coffeeChicoryComposition
    ? input.coffeeChicoryComposition.instant
      ? `INSTANT COFFEE-CHICORY MIXTURE\nMADE FROM BLENDS OF COFFEE AND CHICORY\nCOFFEE ${input.coffeeChicoryComposition.coffeePercent}%\nCHICORY ${input.coffeeChicoryComposition.chicoryPercent}%`
      : `COFFEE BLENDED WITH CHICORY\nTHIS MIXTURE CONTAINS\nCOFFEE ${input.coffeeChicoryComposition.coffeePercent}%\nCHICORY ${input.coffeeChicoryComposition.chicoryPercent}%`
    : null;

  const label = {
    status: "draft_requires_human_review",
    generatedAt: new Date().toISOString(),
    product: { id: context.product.id, name: context.product.name, category: context.product.category },
    frontOfPack: { trueNatureOfFood: input.trueNatureOfFood },
    ingredients: { heading: "Ingredients", orderedNames: ingredients, compositionUnit: input.ingredients[0]?.unit },
    nutritionInformation: {
      declarations: input.nutritionInformation,
      displayEmphasis: ["totalSugars", "addedSugars", "sodium", "saturatedFat"],
      emphasisBasis: "Project brief presentation preference; regulatory status requires review.",
    },
    brandOwner: { name: context.brandOwner.name, completeAddress: input.brandOwnerAddress, fssaiLicenseNumber: context.brandOwner.fssaiLicenseNumber },
    manufacturer: input.manufacturer,
    fssaiLogoAssetUrl: input.fssaiLogoAssetUrl ?? null,
    manufacturerLicenseNumber: input.manufacturerLicenseNumber ?? null,
    netQuantity: input.netQuantity,
    retailSalePrice: input.retailSalePrice ?? null,
    vegetarianMark: input.vegetarianMark ?? null,
    allergenDeclaration: input.allergenDeclaration ?? null,
    batchCode: context.batch.batchCode,
    dateMarking: {
      manufactureDate: context.batch.manufacturingDate,
      bestBeforeDate: context.batch.bestBeforeDate,
      expiryUseByDate: input.expiryUseByDate ?? null,
      storageInstructions: input.storageInstructions ?? context.batch.storageConditions,
    },
    additionalDeclarations: input.additionalDeclarations ?? [],
    coffeeChicoryFrontDeclaration,
    qrCode: { standard: "GS1 Digital Link URI Syntax", uri: digitalLinkUri, dataUrl: qrCodeDataUrl, gtin14: gtin, lot: context.batch.batchCode, bestBefore: context.batch.bestBeforeDate },
    regulatoryReferences: { ...citations, ...(input.coffeeChicoryComposition ? { coffeeChicory: coffeeChicoryReference } : {}) },
    warnings,
  };
  return { label, digitalLinkUri, qrCodeDataUrl, warnings };
}
