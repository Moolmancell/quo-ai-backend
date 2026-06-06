import { prisma } from "../../lib/prisma";

export async function getRelatedQuotes(
    userInterests: {
        id: string;
        topic: string;
        embedding: string;
    }[], 
    quoteHistory: string[], 
    limit: number,
    pastQuotes: string[] = ['']
) {
    let relatedQuotes: any[] = []
    for (const interest of userInterests) {
        let numberOfQuotes = Math.ceil(userInterests.length / limit);
        // Fetch quotes related to each interest
        const relatedQuotesInterests = await prisma.$queryRaw<any[]>`
                SELECT 
                    id, title, author, publication, src, "datePublished", quote, topic, thumbnail, favicon,
                    (1 - (embedding <=> ${interest.embedding}::vector)) AS similarity,
                    'related' as category
                FROM "Quotes"
                WHERE embedding IS NOT NULL 
                AND NOT (id = ANY(${quoteHistory}::text[]))
                AND NOT (id = ANY(${pastQuotes}::text[]))
                ORDER BY similarity DESC
                LIMIT ${numberOfQuotes}
            `
        relatedQuotes = relatedQuotes.concat(relatedQuotesInterests);
    }
    relatedQuotes = relatedQuotes.sort(() => Math.random() - 0.5);
    relatedQuotes = relatedQuotes.slice(0, limit);
    return relatedQuotes;
}