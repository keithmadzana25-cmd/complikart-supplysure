import { randomUUID } from "node:crypto";

export const EVENT_TYPES = ["harvesting", "cooling", "initial_packing", "first_land_receiving", "shipping", "receiving", "transformation"] as const;
export type CompliKartEventType = (typeof EVENT_TYPES)[number];

const bizSteps: Record<CompliKartEventType, string> = {
  harvesting: "https://ref.gs1.org/cbv/BizStep-other",
  cooling: "https://ref.gs1.org/cbv/BizStep-other",
  initial_packing: "https://ref.gs1.org/cbv/BizStep-packing",
  first_land_receiving: "https://ref.gs1.org/cbv/BizStep-receiving",
  shipping: "https://ref.gs1.org/cbv/BizStep-shipping",
  receiving: "https://ref.gs1.org/cbv/BizStep-receiving",
  transformation: "https://ref.gs1.org/cbv/BizStep-transforming",
};

export function bizStepFor(eventType: CompliKartEventType): string {
  return bizSteps[eventType];
}

export interface EpcisEventInput {
  id: string;
  eventType: CompliKartEventType;
  eventTimestamp: string;
  locationGln?: string | null;
  partyGln?: string | null;
  gtin: string;
  batchCode: string;
  quantity?: number | string | null;
  quantityUom?: string | null;
  referenceDocumentUrl?: string | null;
  inputQuantityList?: Array<{ gtin: string; lot: string; quantity: number; uom?: string | undefined }>;
  outputQuantityList?: Array<{ gtin: string; lot: string; quantity: number; uom?: string | undefined }>;
}

function gs1KeyUri(gtin: string, lot: string): string {
  return `https://id.gs1.org/01/${encodeURIComponent(gtin)}/10/${encodeURIComponent(lot)}`;
}

function locationUri(gln: string): string {
  return `https://id.gs1.org/414/${encodeURIComponent(gln)}`;
}

function quantityElement(item: { gtin: string; lot: string; quantity: number; uom?: string | undefined }) {
  return { epcClass: gs1KeyUri(item.gtin, item.lot), quantity: item.quantity, ...(item.uom ? { uom: item.uom } : {}) };
}

export function buildEpcisDocument(input: EpcisEventInput) {
  const common = {
    eventID: `urn:uuid:${input.id || randomUUID()}`,
    eventTime: new Date(input.eventTimestamp).toISOString(),
    eventTimeZoneOffset: offset(input.eventTimestamp),
    bizStep: bizSteps[input.eventType],
    "compliKart:eventType": input.eventType,
    ...(input.locationGln ? { readPoint: { id: locationUri(input.locationGln) }, bizLocation: { id: locationUri(input.locationGln) } } : {}),
    ...(input.partyGln ? { "compliKart:partyGLN": `https://id.gs1.org/417/${encodeURIComponent(input.partyGln)}` } : {}),
    ...(input.referenceDocumentUrl ? { bizTransactionList: [{ type: "https://ref.gs1.org/cbv/BTT-documentation", bizTransaction: input.referenceDocumentUrl }] } : {}),
  };
  const event = input.eventType === "transformation"
    ? {
        type: "TransformationEvent",
        ...common,
        inputQuantityList: (input.inputQuantityList ?? []).map(quantityElement),
        outputQuantityList: (input.outputQuantityList ?? []).map(quantityElement),
      }
    : {
        type: "ObjectEvent",
        ...common,
        action: "OBSERVE",
        quantityList: input.quantity == null ? [] : [quantityElement({ gtin: input.gtin, lot: input.batchCode, quantity: Number(input.quantity), ...(input.quantityUom ? { uom: input.quantityUom } : {}) })],
      };
  return {
    "@context": ["https://ref.gs1.org/standards/epcis/2.0.1/epcis-context.jsonld", { "compliKart": "https://complikart.example/vocab/" }],
    type: "EPCISDocument",
    schemaVersion: "2.0",
    creationDate: new Date().toISOString(),
    epcisBody: { eventList: [event] },
  };
}

function offset(value: string): string {
  const match = value.match(/(Z|[+-]\d{2}:\d{2})$/);
  if (!match || match[1] === "Z") return "+00:00";
  return match[1]!;
}
