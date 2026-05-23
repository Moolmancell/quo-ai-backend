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

        // 2. Find quotes most similar to the user's interests
        // We use cosine distance (<=>) for similarity search
        // 1 - distance = similarity
        const quotes = await prisma.$queryRaw<any[]>`
            SELECT 
                id, 
                title, 
                author, 
                publication, 
                src, 
                "datePublished", 
                quote, 
                topic, 
                thumbnail, 
                favicon,
                (1 - (embedding <=> ${userEmbedding}::vector)) AS similarity
            FROM "Quotes"
            WHERE embedding IS NOT NULL
            ORDER BY similarity DESC
            LIMIT 30
        `;

        return res.status(200).json({
            success: true,
            data: quotes
        });

    } catch (error) {
        console.error("Feed retrieval error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to retrieve feed." 
        });
    }
}