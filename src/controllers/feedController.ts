import { Request, Response } from "express";
import { TavilySearch } from "@langchain/tavily";
import Parser from "rss-parser";
import { createGeminiEmbeddings } from "../lib/gemini-embedings";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { prisma } from '../lib/prisma';
import { z } from "zod";
interface Blog {
    url: string;
    description: string;
    title: string;
    favicon?: string;
    score?: number;
}

async function findRSSfeeds(interests: string[]) {
    console.log("----Finding Links----")
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
        console.log("----Feed Links Found----");
        return feedLinks;
    } catch (e) {
        console.error(`Something went wrong: ${e}`);
    }
}

async function getRSSFeedDescriptionTitleFavicon(feedUrls: string[]) {
    const parser = new Parser();
    const updatedBlogs = await Promise.all(
        feedUrls.map(async (url) => {
            try {
                // Request the RSS XML and parse it
                const feed = await parser.parseURL(url);

                return {
                    url,
                    description: feed.description || "",
                    title: feed.title || "",
                    favicon: feed.image?.url || `${new URL(url).origin}/favicon.ico`
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
    console.log("-----getRSSFeedDescriptionTitleFavicon Done--------")
    return updatedBlogs;
}

async function removeEmptyDescriptionsOrTitles(feeds: Blog[]) {
    return feeds.filter(feed => feed.description.trim() !== "" || feed.title.trim() !== "");
}

async function removeDuplicateFeeds(feeds: Blog[]) {
    const seen = new Set();
    return feeds.filter(feed => {
        const identifier = `${feed.url}-${feed.title}`;
        if (seen.has(identifier)) {
            return false;
        } else {
            seen.add(identifier);
            return true;
        }
    });
}

async function rankRSSfeeds(
    blogs: Blog[],
    userInterestEmbedding: number[],
) {
    console.log('----Ranking Feeds----');
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

    const embeddings = createGeminiEmbeddings(); // Use the patched embeddings with fixed dimensionality

    // 1. Generate embeddings for all blog descriptions
    // We combine Title + Description for better context
    const blogTexts = blogs.map(b => `Title: ${b.title}\nDescription: ${b.description}`);
    const blogVectors = await embeddings.embedDocuments(blogTexts);

    // 2. Get embedding for the user's interest
    const queryEmbedding = userInterestEmbedding;

    // 3. Calculate Cosine Similarity and attach to blog objects
    const rankedBlogs = blogs.map((blog, index) => {
        const blogVector = blogVectors[index];
        const similarity = blogVector ? cosineSimilarity(queryEmbedding, blogVector) : 0;
        return { ...blog, score: similarity };
    });

    // 4. Sort by score (descending)
    console.log('----Feeds Ranking Done----');
    return rankedBlogs.sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function filterTopFeeds(feeds: Blog[], topN: number) {
    return feeds.slice(0, topN);
}

async function extractArticles(feeds: Blog[]) {
    console.log('----Extracting Articles----');
    const parser = new Parser();

    const allArticles = await Promise.all(
        feeds.map(async (blog) => {
            try {
                const minCharacters = 500; // Minimum character threshold for content
                const buffer = 5000;
                const feed = await parser.parseURL(blog.url);

                const recentItems = feed.items.slice(0, 5);

                return recentItems
                    .map((item) => {

                        let cleanContent = item['content:encoded'] || item.content || item.contentSnippet || ''; cleanContent = cleanContent
                            .replace(/<[^>]*>/g, '') // Removes HTML tags
                            .replace(/\bhttps?:\/\/\S+|www\.\S+/gi, '') // Removes URLs
                            .replace(/\s+/g, ' ') // Collapses extra whitespace/newlines into single spaces
                            .trim();

                        if (cleanContent.length > (buffer * 2)) {
                            const head = cleanContent.substring(0, buffer);
                            const tail = cleanContent.substring(cleanContent.length - buffer);
                            cleanContent = `${head}\n\n[...middle section omitted...]\n\n${tail}`;
                        }

                        return {
                            title: item.title || 'Untitled',
                            src: item.link || '',
                            datePublished: item.pubDate || '',
                            content: cleanContent,
                            author: item.creator || feed.title || 'Unknown Author',
                            thumbnail: item.enclosure?.url || item.media?.$?.url,
                            favicon: blog.favicon,
                            publication: blog.title,
                        }
                    })
                    // The Filter Logic:
                    .filter((article) => article.content.length >= minCharacters);

            } catch (error) {
                console.error(`Failed to fetch feed for ${blog.title}:`, error);
                return [];
            }
        })
    );
    console.log('----Article Extraction Done----');
    return allArticles.flat();
}

async function findQuotesFromArticles(articles: any[], batchSize: number = 5) {
    console.log('----Finding Quotes from Articles----');
    const BatchExtractionSchema = z.object({
        results: z.array(
            z.object({
                articleIndex: z.number().describe("The index of the article in the provided list (0-based)"),
                extractedQuotes: z.array(
                    z.object({
                        quote: z.string().describe("Exact quote text"),
                        topic: z.array(z.string()).max(4)
                    })
                )
            })
        )
    });
    const model = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        temperature: 0.2,
    }).withStructuredOutput(BatchExtractionSchema);

    const finalResults: any[] = [];

    // Process articles in chunks (e.g., 5 at a time)
    for (let i = 0; i < articles.length; i += batchSize) {
        const chunk = articles.slice(i, i + batchSize);

        // Prepare a numbered list for the prompt so the AI can track them
        const chunkText = chunk.map((a, index) => `ID: ${index}\nContent: ${a.content}`).join("\n\n---\n\n");

        const prompt = `
            Extract profound quotes from the following ${chunk.length} articles. 
            Return the quotes grouped by their ID.
            
            Articles:
            ${chunkText}
        `;

        try {
            const response = await model.invoke(prompt);

            // Map back to your specific structure using the index to find the original metadata
            response.results.forEach((articleResult) => {
                const originalArticle = chunk[articleResult.articleIndex];

                const mapped = articleResult.extractedQuotes.map(q => ({
                    title: originalArticle.title,
                    author: originalArticle.author,
                    publication: originalArticle.publication,
                    src: originalArticle.src,
                    datePublished: originalArticle.datePublished,
                    quote: q.quote,
                    topic: q.topic,
                }));

                finalResults.push(...mapped);
            });
        } catch (e) {
            console.error("Batch failed, skipping chunk...", e);
        }
    }
    console.log('----Quote Extraction Done----');
    return finalResults;
}

async function sendQuotesToDatabase() {

}

//main controller function to generate quotes based on user interests
export async function generateQuotes(req: Request, res: Response) {
    try {
        const userId = res.locals.session?.user?.id;

        const users = await prisma.$queryRaw<any[]>`
            SELECT 
                interests, 
                "interestEmbedding"::vector as "interest_embedding"
            FROM "user"
            WHERE id = ${userId}
            LIMIT 1
        `;

        const user = users[0];

        const categories = user.interests || [];
        const searchResults = await findRSSfeeds(categories) as any[];
        const feedDescriptions = await getRSSFeedDescriptionTitleFavicon(searchResults.map((feed: any) => feed.url));
        const nonEmptyFeeds = await removeEmptyDescriptionsOrTitles(feedDescriptions);
        const uniqueFeeds = await removeDuplicateFeeds(nonEmptyFeeds);
        const rankedFeeds = await rankRSSfeeds(uniqueFeeds, JSON.parse(user.interest_embedding));
        const topFeeds = await filterTopFeeds(rankedFeeds, 10);
        const extractedArticles = await extractArticles(topFeeds);
        const quotes = await findQuotesFromArticles(extractedArticles);

        console.log(`---- Pipeline Finished. Quotes found: ${quotes.length} ----`);
        console.log("---- Attempting to send response... ----");

        return res.status(200).json({
            success: true,
            data: quotes
        });
    } catch (error) {
        console.error("Feed generation error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate feed."
        });
    }
}
