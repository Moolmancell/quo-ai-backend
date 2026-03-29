-- CreateTable
CREATE TABLE "Quotes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publication" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "datePublished" TIMESTAMP(3) NOT NULL,
    "quote" TEXT NOT NULL,
    "topic" TEXT[],
    "thumbnail" TEXT,
    "favicon" TEXT,

    CONSTRAINT "Quotes_pkey" PRIMARY KEY ("id")
);
