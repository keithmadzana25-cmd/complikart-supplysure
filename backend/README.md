# Label generation endpoint

`POST /api/labels/generate` requires a user bearer token and a product and batch owned by that user. It validates the GTIN check digit, records the GTIN on the product, orders supplied ingredients by manufacturing weight/volume, builds a draft label with clause citations, generates a QR PNG data URL, and saves a versioned label record. Apply migration `003_product_gtin.sql` before using this endpoint.

The GS1 URI uses the GTIN (AI 01) and lot (AI 10) as path identifiers and the Best Before date as AI 15. The URI and PNG are returned in the response; the URI is stored in the label record. See the [GS1 Digital Link URI Syntax](https://ref.gs1.org/standards/digital-link/uri-syntax/1.7.0/) for the current standard.

Example request body (values are illustrative):

```json
{
  "productId": "00000000-0000-4000-8000-000000000001",
  "batchId": "00000000-0000-4000-8000-000000000002",
  "gtin": "09520123456788",
  "trueNatureOfFood": "Example snack",
  "ingredients": [
    { "name": "Ingredient A", "amountAtManufacture": 70, "unit": "g" },
    { "name": "Ingredient B", "amountAtManufacture": 30, "unit": "g" }
  ],
  "brandOwnerAddress": "Complete brand owner address",
  "manufacturer": { "name": "Example Foods", "completeAddress": "Complete manufacturing address" },
  "netQuantity": { "value": 100, "unit": "g" },
  "nutritionInformation": {
    "energyKcal": 0,
    "proteinG": 0,
    "carbohydrateG": 0,
    "totalSugarsG": 0,
    "addedSugarsG": 0,
    "totalFatG": 0,
    "saturatedFatG": 0,
    "transFatG": 0,
    "sodiumMg": 0,
    "perServeRdaPercent": {}
  }
}
```

## EPCIS traceability events

Apply `004_epcis_events.sql` after the product GTIN migration. `POST /api/events/record` records the event and returns an EPCIS 2.0 JSON-LD document. All event types require an owned batch whose product has a GTIN. Supply `locationGln` and `partyGln` as 13-digit GLNs; supply `quantityUom` using a UN/CEFACT unit code such as `KGM`, `LTR`, or `EA`. Transformation events must include non-empty `inputQuantityList` and `outputQuantityList`, each containing a GTIN, lot, quantity, and optional unit. The traceability read API returns these stored EPCIS documents with the batch events.

Harvesting and cooling are preserved as CompliKart event types in a JSON-LD extension and use the GS1 CBV `other` step because those labels are not defined in the GS1 CBV business-step list. The standard CBV steps are used for packing, receiving, shipping, and transforming. The event row's `retention_until` is two years after event time; the application does not automatically delete records at that date. Apply migrations to existing databases using the project's normal database migration procedure; the Compose initialization directory only runs scripts when PostgreSQL first creates a data volume.

## Local Docker setup on Windows

Docker Desktop needs WSL 2 or a supported Hyper-V setup. This machine currently reports WSL as not installed, and the Docker Desktop installer could not be launched in this managed shell. In an administrator PowerShell, run `wsl --install`, restart Windows if prompted, then install Docker Desktop using the [official Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/). Open Docker Desktop and wait until its engine is running, then from the project root run `docker compose up --build`. If Windows policy prevents enabling WSL or virtualization, request that the device administrator enable the WSL and Virtual Machine Platform features.

Every result remains `draft_requires_human_review`. The API flags missing nutrition inputs, Expiry/Use By date, logo asset, veg/non-veg status, allergen review, and category-specific concerns rather than asserting FSSAI compliance. Nutrient bold emphasis follows the project brief's requested presentation and is not represented as an effective legal requirement by this generator. For a coffee-chicory product, pass `coffeeChicoryComposition` to generate the required current front-of-pack declaration under Schedule II, paragraph 2.2, effective 1 July 2026.
