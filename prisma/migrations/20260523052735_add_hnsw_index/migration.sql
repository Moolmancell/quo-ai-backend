-- Create the HNSW index for cosine similarity on the Quotes table
CREATE INDEX IF NOT EXISTS "Quotes_embedding_hnsw_idx" 
ON "Quotes" 
USING hnsw (embedding vector_cosine_ops);
