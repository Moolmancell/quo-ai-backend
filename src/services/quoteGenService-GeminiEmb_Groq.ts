import { TavilySearch } from "@langchain/tavily";
import Parser from "rss-parser";
import { createGeminiEmbeddings } from "../lib/gemini-embedings";
import { ChatGroq } from "@langchain/groq"
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { cleanRSSContent, cosineSimilarity, truncateContent } from "../utils/textUtils";
import { delay } from "../utils/delayUtils";

export interface Blog {
    url: string;
    description: string;
    title: string;
    favicon?: string;
    score?: number;
}

export interface ArticleInput {
    title: string;
    src: string;
    datePublished: string;
    content: string;
    author: string;
    thumbnail: string;
    favicon: string;
    publication: string;
}

export interface QuoteOutput {
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

export class FeedService {
    private parser = new Parser();

    async findRSSfeeds(interests: string[], maxResults: number = 50) {
        console.log("----Finding Links----");
        const tool = new TavilySearch({ maxResults });

        try {
            const response = await tool.invoke({
                query: `site:.substack.com ${interests.join(" ")}`,
                searchDepth: "advanced"
            });
            
            const searchResults = (response.results || []).map((item: any) => ({
                url: item.url,
            }));

            const feedLinks = searchResults.map((item: any) => {
                const root = new URL(item.url);
                return {
                    ...item,
                    url: `${root.origin}/feed`
                };
            });

            console.log("----Feed Links Found----");
            return feedLinks;
        } catch (e) {
            console.error(`Something went wrong: ${e}`);
            throw e;
        }
    }

    async getFeedMetadata(feedUrls: string[]) {
        const updatedBlogs = await Promise.all(
            feedUrls.map(async (url) => {
                try {
                    const feed = await this.parser.parseURL(url);
                    return {
                        url,
                        description: feed.description || "",
                        title: feed.title || "",
                        favicon: feed.image?.url || `${new URL(url).origin}/favicon.ico`
                    };
                } catch (error) {
                    console.error(`Error fetching feed for ${url}:`, error instanceof Error ? error.message : String(error));
                    return { url, description: "", title: "" };
                }
            })
        );
        return updatedBlogs;
    }

    async sanitizeFeeds(feeds: Blog[]): Promise<Blog[]> {
        const seen = new Set();
        return feeds
            .filter(feed => feed.description.trim() !== "" || feed.title.trim() !== "")
            .filter(feed => {
                const identifier = `${feed.url}-${feed.title}`;
                if (seen.has(identifier)) return false;
                seen.add(identifier);
                return true;
            });
    }

    async rankFeeds(blogs: Blog[], userInterestEmbedding: number[]) {
        console.log('----Ranking Feeds----');
        const embeddings = createGeminiEmbeddings();
        const blogTexts = blogs.map(b => `Title: ${b.title}\nDescription: ${b.description}`);
        const blogVectors = await embeddings.embedDocuments(blogTexts);

        const rankedBlogs = blogs.map((blog, index) => {
            const blogVector = blogVectors[index];
            const similarity = blogVector ? cosineSimilarity(userInterestEmbedding, blogVector) : 0;
            return { ...blog, score: similarity };
        });

        return rankedBlogs.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    async extractArticles(feeds: Blog[], numberOfArticles: number = 5): Promise<ArticleInput[]> {
        console.log('----Extracting Articles----');
        const minCharacters = 500;

        const allArticles = await Promise.all(
            feeds.map(async (blog) => {
                try {
                    const feed = await this.parser.parseURL(blog.url);
                    const recentItems = feed.items.slice(0, numberOfArticles);

                    return recentItems
                        .map((item) => {
                            let content = item['content:encoded'] || item.content || item.contentSnippet || '';
                            content = cleanRSSContent(content);
                            content = truncateContent(content);

                            return {
                                title: item.title || 'Untitled',
                                src: item.link || '',
                                datePublished: item.pubDate || '',
                                content: content,
                                author: item.creator || feed.title || 'Unknown Author',
                                thumbnail: item.enclosure?.url || item.media?.$?.url,
                                favicon: blog.favicon || '',
                                publication: blog.title,
                            };
                        })
                        .filter((article) => article.content.length >= minCharacters);
                } catch (error) {
                    console.error(`Failed to fetch feed for ${blog.title}:`, error);
                    return [];
                }
            })
        );
        return allArticles.flat();
    }

    async findQuotesFromArticles(articles: ArticleInput[]): Promise<QuoteOutput[]> {
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

        const structuredModel = model.withStructuredOutput(ExtractionSchema, { name: "extract_quotes" });
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
                await delay(30000); // Delay to respect rate limits
                const result = await extractionChain.invoke({ content: article.content });
                if (result && result.quotes) {
                    const mappedQuotes = result.quotes.map((q: any) => ({
                        ...article,
                        quote: q.quote,
                        topic: q.topic,
                    }));
                    finalResults.push(...mappedQuotes);
                }
            } catch (error) {
                console.error(`Error processing article "${article.title}":`, error);
            }
        }
        return finalResults;
    }

    async saveQuotes(quotes: QuoteOutput[]) {
        //TODO: Implement database saving logic here, ensuring no duplicates and proper associations with users and sources.
    }
}
