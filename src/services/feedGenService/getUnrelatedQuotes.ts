import { prisma } from "../../lib/prisma";

export async function getUnrelatedQuotes(
    userEmbedding: string, 
    quoteHistory: string[], 
    limit: number,
    pastQuotes: string[] = ['']
) {
    let unrelatedQuotes: any[] = []
    // Fetch unrelated quotes based on user embedding
    const unrelatedQuotesData = await prisma.$queryRaw<any[]>`
        SELECT 
            id, title, author, publication, src, "datePublished", quote, topic, thumbnail, favicon,
            (1 - (embedding <=> ${userEmbedding}::vector)) AS similarity,
            'discovery' as category
        FROM "Quotes"
        WHERE embedding IS NOT NULL
        AND NOT (id = ANY(${quoteHistory}::text[]))
        AND NOT (id = ANY(${pastQuotes}::text[]))
        ORDER BY RANDOM()
        LIMIT ${limit}
    `
    unrelatedQuotes = unrelatedQuotes.concat(unrelatedQuotesData);
    return unrelatedQuotes;
}