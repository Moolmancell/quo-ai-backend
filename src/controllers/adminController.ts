import { Request, Response } from "express";
import { FeedService } from "../services/quoteGenService-GeminiEmb_Gemma";
import { FeedService2 } from "../services/quoteGenService_v2";

const feedService = new FeedService();
const feedService2 = new FeedService2();

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

export async function generateQuotesByInterestsV2(req: Request, res: Response) {
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
        //const userEmbedding = await feedService.generateEmbeddingFromInterests(interests);
        const enrichedArticlesList = [];
        for (const interest of interests) {
            const articles = await feedService2.findArticlesByInterests(interest, 20);
            const filterResults = await feedService2.filterResults(articles);
            const enrichedArticles = await feedService2.getPublishedDateFromArticles(filterResults);
            const quotes = await feedService2.findQuotesFromArticles(enrichedArticles, interest);
            const quotesWithEmbeddings = await feedService2.generateQuoteEmbeddings(quotes);
            await feedService2.saveQuotes(quotesWithEmbeddings);
            enrichedArticlesList.push(...enrichedArticles);
        }

        return res.status(200).json({
            success: true,
            data: enrichedArticlesList
        });
    } catch (error) {
        console.error("Feed generation by interests error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate feed by interests."
        });
    }

}