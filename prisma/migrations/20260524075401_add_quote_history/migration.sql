-- DropIndex
DROP INDEX "Quotes_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "quoteHistory" TEXT[] DEFAULT ARRAY[]::TEXT[];
