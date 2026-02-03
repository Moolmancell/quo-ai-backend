-- This is an empty migration.
ALTER TABLE "user" 
ALTER COLUMN "interestEmbedding" TYPE vector(768);