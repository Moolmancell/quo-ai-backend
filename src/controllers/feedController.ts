import { Request, Response } from "express";
import { TavilySearch } from "@langchain/tavily";
import Parser from "rss-parser";
import { GoogleGenAIEmbeddingsWithDimensions } from "../lib/gemini-embedings";
import { TaskType } from "@google/generative-ai";

interface Blog {
    url: string;
    description: string;
    title: string;
    score?: number;
}

async function findRSSfeeds(interests: string[]) {

    function filterSubstackResults(links: any[]) {
        const feedLinks = links
            .filter(item => item.url) // Ensure the object has a URL
            .map(item => {
                const root = new URL(item.url);
                return {
                    ...item,
                    url: `${root.origin}/feed`
                };
            });
        return feedLinks;
    }

    const tool = new TavilySearch({
        maxResults: 50,
    });

    try {
        const response = await tool.invoke({
            query: `site:.substack.com ${interests.join(" ")}`,
            searchDepth: "advanced"
        });
        const searchResults = (response.results || []).map((item: any) => ({
            url: item.url,
        }));
        const feedLinks = filterSubstackResults(searchResults);
        return feedLinks;
    } catch (e) {
        console.error(`Something went wrong: ${e}`);
    }
}

async function getRSSFeedDescription(feedUrls: string[]) {
    const parser = new Parser();
    const updatedBlogs = await Promise.all(
        feedUrls.map(async (url) => {
            try {
                // Request the RSS XML and parse it
                const feed = await parser.parseURL(url);

                return {
                    url,
                    description: feed.description || "",
                    title: feed.title || ""
                };
            } catch (error) {
                console.error(`Error fetching feed for ${url}:`, error instanceof Error ? error.message : String(error));
                return {
                    url,
                    description: "",
                    title: ""
                };
            }
        })
    );

    return updatedBlogs;
}

async function rankRSSfeeds(
    blogs: Blog[],
    userInterest: string,
) {

    function cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let mA = 0;
        let mB = 0;

        for (let i = 0; i < vecA.length; i++) {
            const a = vecA[i];
            const b = vecB[i];

            if (a === undefined || b === undefined) continue;

            dotProduct += a * b;
            mA += a * a;
            mB += b * b;
        }

        return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
    }    

    const embeddings = new GoogleGenAIEmbeddingsWithDimensions({
        apiKey: process.env.GOOGLE_API_KEY || "",
        model: "gemini-embedding-001", // Latest Gemini embedding model
        taskType: TaskType.RETRIEVAL_DOCUMENT,
    });

    // 1. Generate embeddings for all blog descriptions
    // We combine Title + Description for better context
    const blogTexts = blogs.map(b => `${b.title}: ${b.description}`);
    const blogVectors = await embeddings.embedDocuments(blogTexts);

    // 2. Generate embedding for the user's interest
    const queryEmbedding = await embeddings.embedQuery(userInterest);

    // 3. Calculate Cosine Similarity and attach to blog objects
    const rankedBlogs = blogs.map((blog, index) => {
        const blogVector = blogVectors[index];
        const similarity = blogVector ? cosineSimilarity(queryEmbedding, blogVector) : 0;
        return { ...blog, score: similarity };
    });

    // 4. Sort by score (descending)
    return rankedBlogs.sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function extractArticles() {

}

async function findQuotesFromArticles() {

}

async function sendQuotesToDatabase() {

}

//main controller function to generate quotes based on user interests
export async function generateQuotes(req: Request, res: Response) {
    try {
        const categories = ['Technology', 'Programming', 'Philosophy', 'Video Games', 'Film'];
        const searchResults = await findRSSfeeds(categories) as any[];
        const feedDescriptions = await getRSSFeedDescription(searchResults.map((feed: any) => feed.url));
        console.log("Feed Descriptions:", feedDescriptions);
        return res.status(200).json({
            success: true,
        });
    } catch (error) {
        console.error("Feed generation error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate feed."
        });
    }
}
