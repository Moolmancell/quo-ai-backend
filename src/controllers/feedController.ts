import { Request, Response } from "express";
import { prisma } from '../lib/prisma';

export async function getFeed(req: Request, res: Response) {
    const userId = res.locals.session?.user?.id;

    if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
        // 1. Fetch the user's interest embedding and history
        const users = await prisma.$queryRaw<any[]>`
            SELECT 
                "interestEmbedding"::vector as embedding,
                "quoteHistory"
            FROM "user"
            WHERE id = ${userId}
            LIMIT 1
        `;

        const userEmbedding = users[0]?.embedding;
        const quoteHistory = users[0]?.quoteHistory || [];
        
        if (!userEmbedding) {
            return res.status(404).json({ 
                success: false, 
                message: "No interests found. Please set your interests first." 
            });
        }

        // 2. Fetch a diversified set of quotes (70/20/10 distribution)
        // Filtering out already seen quotes using quoteHistory
        const diversifiedQuotes = await prisma.$queryRaw<any[]>`
            (
                SELECT 
                    id, title, author, publication, src, "datePublished", quote, topic, thumbnail, favicon,
                    (1 - (embedding <=> ${userEmbedding}::vector)) AS similarity,
                    'core' as category
                FROM "Quotes"
                WHERE embedding IS NOT NULL 
                AND NOT (id = ANY(${quoteHistory}::text[]))
                ORDER BY similarity DESC
                LIMIT 21
            )
            UNION ALL
            (
                SELECT 
                    id, title, author, publication, src, "datePublished", quote, topic, thumbnail, favicon,
                    (1 - (embedding <=> ${userEmbedding}::vector)) AS similarity,
                    'related' as category
                FROM "Quotes"
                WHERE embedding IS NOT NULL
                AND NOT (id = ANY(${quoteHistory}::text[]))
                ORDER BY similarity DESC
                OFFSET 21
                LIMIT 6
            )
            UNION ALL
            (
                SELECT 
                    id, title, author, publication, src, "datePublished", quote, topic, thumbnail, favicon,
                    (1 - (embedding <=> ${userEmbedding}::vector)) AS similarity,
                    'discovery' as category
                FROM "Quotes"
                WHERE embedding IS NOT NULL
                AND NOT (id = ANY(${quoteHistory}::text[]))
                ORDER BY RANDOM()
                LIMIT 3
            )
        `;

        // 3. Update User History
        const newQuoteIds = diversifiedQuotes.map(q => q.id);
        if (newQuoteIds.length > 0) {
            const updatedHistory = [...new Set([...newQuoteIds, ...quoteHistory])].slice(0, 500);
            
            await prisma.user.update({
                where: { id: userId },
                data: { quoteHistory: updatedHistory }
            });
        }

        // 4. Shuffle the results to mix categories
        const shuffledFeed = diversifiedQuotes.sort(() => Math.random() - 0.5);

        // 5. Strip out the similarity field from the final output
        const finalFeed = shuffledFeed.map(({ similarity, ...rest }) => rest);

        return res.status(200).json({
            success: true,
            count: finalFeed.length,
            data: finalFeed
        });

    } catch (error) {
        console.error("Feed retrieval error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to retrieve feed." 
        });
    }
}