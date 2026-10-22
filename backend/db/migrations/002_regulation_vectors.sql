-- pgvector storage for source-grounded regulation retrieval (all-MiniLM-L6-v2, 384 dimensions).
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE regulation_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_title TEXT NOT NULL,
    clause_number TEXT NOT NULL,
    content TEXT NOT NULL,
    effective_date DATE NOT NULL,
    source_url TEXT NOT NULL,
    embedding vector(384) NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT regulation_chunks_source_clause_hash_unique UNIQUE (source_url, clause_number, content_sha256)
);

CREATE INDEX regulation_chunks_embedding_idx
    ON regulation_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX regulation_chunks_effective_date_idx ON regulation_chunks (effective_date);
COMMIT;
