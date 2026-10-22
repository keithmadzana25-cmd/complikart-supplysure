# CompliKart AI service

The service ingests HTTPS documents hosted on `fssai.gov.in` or `foscos.fssai.gov.in`, extracts clause-like passages, embeds them with `sentence-transformers/all-MiniLM-L6-v2`, and returns the three closest passages with the supplied clause label, effective date, and source URL.

Apply migrations in `backend/db/migrations` before starting the service. For a new Docker volume, Compose mounts those SQL migrations into the PostgreSQL initialization directory. The embedding model is downloaded by Sentence Transformers on first use; the AI container needs outbound access to the Hugging Face model host unless the model is preloaded in the image/runtime.

## Ingest an official source

Set a private `AI_INGEST_TOKEN` in the local `.env`. Submit each official regulation compendium and amendment separately, using its official source URL and the effective/publication date confirmed from that source:

```http
POST /regulations/ingest
Authorization: Bearer <local-ingest-token>
Content-Type: application/json

{
  "source_url": "https://www.fssai.gov.in/upload/uploadfiles/files/Comp_Labelling%20Display_Version%20VIII_09_09_2025.pdf",
  "title": "Food Safety and Standards (Labelling and Display) Regulations, 2020, Version VIII",
  "effective_date": "2025-09-09"
}
```

Do not treat this one compendium as a complete current ruleset. Check and ingest later amendments from the official [FSSAI Labelling and Display amendments page](https://www.fssai.gov.in/food-law/regulations/amendments/labelling-display). The ingest process stores only extracted text and its source reference; it does not decide whether a clause applies to a particular food business.

## Ask a question

`POST /ask` accepts `{"question":"..."}` and returns three retrieved citations. If `LLM_ENDPOINT` and `LLM_MODEL` point to an OpenAI-compatible chat completions endpoint, the service also generates a source-grounded answer. `LLM_API_KEY` is optional and read only from the environment. Without an LLM endpoint, the service returns the citations plus a review recommendation and no generated legal answer.

Ingestion is disabled unless `AI_INGEST_TOKEN` is configured. Use TLS and network access controls when deploying outside local development.
