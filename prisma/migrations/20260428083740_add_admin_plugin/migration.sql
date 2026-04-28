/*
  Warnings:

  - A unique constraint covering the columns `[src,quote]` on the table `Quotes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "session" ADD COLUMN     "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "banExpiresAt" TIMESTAMP(3),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user';

-- CreateIndex
CREATE UNIQUE INDEX "Quotes_src_quote_key" ON "Quotes"("src", "quote");
