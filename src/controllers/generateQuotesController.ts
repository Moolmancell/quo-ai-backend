import { Request, Response } from "express";
import { prisma } from '../lib/prisma';
import { FeedService } from "../services/quoteGenService-GeminiEmb_Groq";

const feedService = new FeedService();

const DEFAULT_CONFIG = {
    numberOfFeeds: 2,
    topFeedsToKeep: 2,
    articlesPerFeed: 1
};


export async function generateQuotes(req: Request, res: Response) {
    try {
        const userId = res.locals.session?.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const users = await prisma.$queryRaw<any[]>`
            SELECT 
                interests, 
                "interestEmbedding"::vector as "interest_embedding"
            FROM "user"
            WHERE id = ${userId}
            LIMIT 1
        `;

        const user = users[0];
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const categories = user.interests || [];
        const userEmbedding = typeof user.interest_embedding === 'string' 
            ? JSON.parse(user.interest_embedding) 
            : user.interest_embedding;

        if (!userEmbedding) {
            return res.status(400).json({ success: false, message: "User interests not initialized." });
        }
        
        const quotesWithEmbeddings = await feedService.generateQuotesPipeline(categories, userEmbedding, DEFAULT_CONFIG);

        return res.status(200).json({
            success: true,
            data: quotesWithEmbeddings
        });
    } catch (error) {
        console.error("Feed generation error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate feed."
        });
    }
}
