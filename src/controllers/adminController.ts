import { Request, Response } from "express";
import { FeedService } from "../services/quoteGenService-GeminiEmb_Gemma";

const feedService = new FeedService();

const DEFAULT_CONFIG = {
    numberOfFeeds: 30,
    topFeedsToKeep: 10,
    articlesPerFeed: 5
};

export async function generateQuotesByInterests(req: Request, res: Response) {
    try {
        const interests = req.body.interests || req.query.interests;
        
        if (!interests || !Array.isArray(interests)) {
            return res.status(400).json({ 
                success: false, 
                message: "Interests are required as an array in the request body or query parameters." 
            });
        }

        console.log(`Generating quotes for interests: ${interests.join(", ")}`);

        // Generate embedding for the provided interests
        const userEmbedding = await feedService.generateEmbeddingFromInterests(interests);
        
        const quotesWithEmbeddings = await feedService.generateQuotesPipeline(interests, userEmbedding, DEFAULT_CONFIG);

        return res.status(200).json({
            success: true,
            data: quotesWithEmbeddings
        });
    } catch (error) {
        console.error("Feed generation by interests error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate feed by interests."
        });
    }
}