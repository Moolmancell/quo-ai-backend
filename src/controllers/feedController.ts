import { Request, Response } from "express";
import { prisma } from '../lib/prisma';
import { FeedService } from "../services/quoteGenService-GeminiEmb_Groq";

const feedService = new FeedService();

/**
 * Main controller function to generate quotes based on user interests.
 */
export async function generateQuotes(req: Request, res: Response) {
    const CONFIG = {
        numberOfFeeds: 2,
        topFeedsToKeep: 2,
        articlesPerFeed: 1
    };

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
        
        // 1. Find RSS feeds based on interests
        const searchResults = await feedService.findRSSfeeds(categories, CONFIG.numberOfFeeds);
        
        // 2. Get metadata and sanitize
        const feedMetadata = await feedService.getFeedMetadata(searchResults.map((f: any) => f.url));
        const sanitizedFeeds = await feedService.sanitizeFeeds(feedMetadata);
        
        // 3. Rank and filter
        const userEmbedding = typeof user.interest_embedding === 'string' 
            ? JSON.parse(user.interest_embedding) 
            : user.interest_embedding;
            
        const rankedFeeds = await feedService.rankFeeds(sanitizedFeeds, userEmbedding);
        const topFeeds = rankedFeeds.slice(0, CONFIG.topFeedsToKeep);
        
        // 4. Extract articles and quotes
        const extractedArticles = await feedService.extractArticles(topFeeds, CONFIG.articlesPerFeed);
        const quotes = await feedService.findQuotesFromArticles(extractedArticles);

        // 5. Generate embeddings for quotes
        const quotesWithEmbeddings = await feedService.generateHuggingFaceEmbeddings(quotes);

        // 6. Save quotes to database
        await feedService.saveQuotes(quotesWithEmbeddings);
        
        console.log(`---- Pipeline Finished. Quotes found: ${quotesWithEmbeddings.length} ----`);

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
