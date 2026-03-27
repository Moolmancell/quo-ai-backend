import { Request, Response } from "express";
import { TavilySearch } from "@langchain/tavily";
import Parser from "rss-parser";
import { createGeminiEmbeddings } from "../lib/gemini-embedings";
import { ChatGroq } from "@langchain/groq"
import { prisma } from '../lib/prisma';
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
interface Blog {
    url: string;
    description: string;
    title: string;
    favicon?: string;
    score?: number;
}

interface ArticleInput {
    title: string;
    src: string;
    datePublished: string;
    content: string;
    author: string;
    thumbnail: string;
    favicon: string;
    publication: string;
}

interface QuoteOutput {
    title: string;
    author: string;
    publication: string;
    src: string;
    datePublished: string;
    quote: string;
    topic: string[];
    thumbnail: string;
    favicon: string;
}

async function findRSSfeeds(interests: string[], maxResults: number = 50) {
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
        maxResults: maxResults,
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

async function extractArticles(feeds: Blog[], numberOfArticles: number = 5): Promise<ArticleInput[]> {
    console.log('----Extracting Articles----');
    const parser = new Parser();

    const allArticles = await Promise.all(
        feeds.map(async (blog) => {
            try {
                const minCharacters = 500; // Minimum character threshold for content
                const buffer = 5000;
                const feed = await parser.parseURL(blog.url);

                const recentItems = feed.items.slice(0, numberOfArticles);

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
                            favicon: blog.favicon || '',
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

async function findQuotesFromArticles(articles: ArticleInput[]): Promise<QuoteOutput[]> {
    console.log('----Extracting Quotes from Articles----');

    const ExtractionSchema = z.object({
        quotes: z.array(
            z.object({
                quote: z.string().describe("The exact, unaltered extracted quote from the text."),
                topic: z.array(z.string()).max(4).describe("Up to 4 relevant categories or topics."),
            })
        ).describe("A list of quotes extracted from the article."),
    });

    const model = new ChatGroq({
        model: "openai/gpt-oss-20b",
        temperature: 0.1,
        apiKey: process.env.GROQ_API_KEY || "",
    });

    const structuredModel = model.withStructuredOutput(ExtractionSchema, {
        name: "extract_quotes"
    });

    const prompt = PromptTemplate.fromTemplate(`
        You are an expert editor and curator. 
        Extract the most profound quotes from the content provided.
        
        Rules:
        1. Extract multiple quotes if they are insightful.
        2. DO NOT alter the text; must be exact matches.
        3. Max 4 topics per quote.
        
        Article Content:
        {content}
    `);

    const extractionChain = prompt.pipe(structuredModel);

    const finalResults: QuoteOutput[] = [];

    for (const article of articles) {
        try {
            const result = await extractionChain.invoke({ content: article.content });

            if (result && result.quotes) {
                const mappedQuotes: QuoteOutput[] = result.quotes.map((q) => ({
                    title: article.title,
                    author: article.author,
                    publication: article.publication,
                    src: article.src,
                    datePublished: article.datePublished,
                    quote: q.quote,
                    topic: q.topic,
                    thumbnail: article.thumbnail,
                    favicon: article.favicon,
                }));

                console.log(`Extracted ${mappedQuotes.length} quotes from article: "${article.title}"`);
                finalResults.push(...mappedQuotes);
            }
        } catch (error) {
            console.error(`Error processing article "${article.title}":`, error);
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
        const searchResults = await findRSSfeeds(categories, 2) as any[]; // Get 20 feed URLs to start with, we will filter down later
        const feedDescriptions = await getRSSFeedDescriptionTitleFavicon(searchResults.map((feed: any) => feed.url));
        const nonEmptyFeeds = await removeEmptyDescriptionsOrTitles(feedDescriptions);
        const uniqueFeeds = await removeDuplicateFeeds(nonEmptyFeeds);
        const rankedFeeds = await rankRSSfeeds(uniqueFeeds, JSON.parse(user.interest_embedding));
        const topFeeds = await filterTopFeeds(rankedFeeds, 2); // Keep top 10 feeds to manage token limits and processing time
        const extractedArticles = await extractArticles(topFeeds, 1); // Extract 2 articles per feed to stay within token limits
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
