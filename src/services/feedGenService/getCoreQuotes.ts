import { prisma } from "../../lib/prisma";

export async function getCoreQuotes(
    userEmbedding: string, 
    quoteHistory: string[], 
    limit: number,
    pastQuotes: string[] = ['']
) {
    let coreQuotes: any[] = []
    // Fetch core quotes based on user embedding
    const coreQuotesData = await prisma.$queryRaw<any[]>`
        SELECT 
            id, title, author, publication, src, "datePublished", quote, topic, thumbnail, favicon,
            (1 - (embedding <=> ${userEmbedding}::vector)) AS similarity,
            'core' as category
        FROM "Quotes"
        WHERE embedding IS NOT NULL 
        AND NOT (id = ANY(${quoteHistory}::text[]))
        AND NOT (id = ANY(${pastQuotes}::text[]))
        ORDER BY similarity DESC
        LIMIT ${limit}
    `
    coreQuotes = coreQuotes.concat(coreQuotesData);
    return coreQuotes;
}