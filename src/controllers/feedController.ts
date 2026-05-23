import { Request, Response } from "express";
import { prisma } from '../lib/prisma';

export async function getFeed(req: Request, res: Response) {
    const userId = res.locals.session?.user?.id;

    if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
        // 1. Fetch the user's interest embedding
        const users = await prisma.$queryRaw<any[]>`
            SELECT "interestEmbedding"::vector as embedding
            FROM "user"
            WHERE id = ${userId}
            LIMIT 1
        `;

        const userEmbedding = users[0]?.embedding;
        
        if (!userEmbedding) {
            return res.status(404).json({ 
                success: false, 
                message: "No interests found. Please set your interests first." 
            });
        }

        // 2. Fetch a diversified set of quotes (70/20/10 distribution)
        // Part 1: 70% Core (21 quotes) - Highest similarity
        // Part 2: 20% Related (6 quotes) - Middle similarity
        // Part 3: 10% Discovery (3 quotes) - Random selection
        const diversifiedQuotes = await prisma.$queryRaw<any[]>`
            (
                SELECT 
                    id, title, author, publication, src, "datePublished", quote, topic, thumbnail, favicon,
                    (1 - (embedding <=> ${userEmbedding}::vector)) AS similarity,
                    'core' as category
                FROM "Quotes"
                WHERE embedding IS NOT NULL
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
                ORDER BY RANDOM()
                LIMIT 3
            )
        `;

        // 3. Shuffle the results to mix categories
        const shuffledFeed = diversifiedQuotes.sort(() => Math.random() - 0.5);

        return res.status(200).json({
            success: true,
            count: shuffledFeed.length,
            data: shuffledFeed
        });

    } catch (error) {
        console.error("Feed retrieval error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to retrieve feed." 
        });
    }
}