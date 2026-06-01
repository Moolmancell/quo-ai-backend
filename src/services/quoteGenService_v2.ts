import { TavilySearch } from "@langchain/tavily";
import axios from "axios";
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatGoogle } from "@langchain/google";
import { z } from "zod";
import { delay } from "../utils/delayUtils";
import { createGeminiEmbeddings } from "../lib/gemini-embedings";
import { prisma } from "../lib/prisma";
const metascraper = require('metascraper')([
    require('metascraper-date')(),
    require('metascraper-author')(),
    require('metascraper-publisher')(),
]);

interface SearchResults {
    src: string;
    title: string;
    favicon: string;
    thumbnail: string;
    content: string;
    datePublished?: string;
    publication?: string;
    author?: string;
}

interface ArticleInput {
    src: string;
    title: string;
    favicon: string;
    thumbnail: string;
    content: string;
    datePublished: string;
    publication: string;
    author: string;
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
    embedding?: number[];
}

export class FeedService2 {
    async findArticlesByInterests(interest: string, maxResults: number = 20) {
        console.log("----Finding Articles----");
        const tool = new TavilySearch({
            maxResults,
            includeFavicon: true,
            includeImages: true,
            includeRawContent: true
        });

        try {
            const response = await tool.invoke({
                query: `site:.substack.com ${interest}`,
                searchDepth: "advanced"
            } as any);

            const searchResults = (response.results || []).map((item: any) => ({
                src: item.url,
                title: item.title,
                favicon: item.favicon,
                thumbnail: (item.images && item.images.length > 0) ? item.images[0] : (item.image && item.image.length > 0 ? item.image[0] : ""),
                content: item.rawContent || item.content || ""
            }));

            console.log("----Article Links Found----");
            return searchResults;
        } catch (e) {
            console.error(`Something went wrong: ${e}`);
            throw e;
        }
    }

    async filterResults(results: SearchResults[]): Promise<SearchResults[]> {
        const substackPostRegex = /^https:\/\/[a-zA-Z0-9-]+\.substack\.com\/p\/[\w-]+/;
        return results.filter(result => substackPostRegex.test(result.src));
    }

    async getPublishedDateFromArticles(results: SearchResults[]): Promise<ArticleInput[]> {
        console.log("----Enriching Articles with Publish Dates via Metascraper----");

        const enrichedResults = await Promise.all(results.map(async (result) => {
            try {
                const response = await axios.get(result.src, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                const html = response.data;
                const url = response.config.url || result.src;

                const metadata = await metascraper({ html, url });

                if (metadata) {
                    result.datePublished = metadata.date;
                    result.publication = metadata.publisher || new URL(result.src).hostname;
                    result.author = metadata.author || "";
                }
            } catch (error) {
                console.error(`Error fetching metadata for ${result.src}:`, error instanceof Error ? error.message : String(error));
            }
            return result as ArticleInput;
        }));

        return enrichedResults;
    }

    async findQuotesFromArticles(articles: ArticleInput[], interest: string): Promise<QuoteOutput[]> {
        console.log('----Extracting Quotes from Articles----');

        const ExtractionSchema = z.object({
            quotes: z.array(
                z.object({
                    quote: z.string().describe("The exact, unaltered extracted quote from the text."),
                    topic: z.array(z.string()).max(4).describe("Up to 4 relevant categories or topics."),
                })
            ).describe("A list of quotes extracted from the article."),
        });

        const model = new ChatGoogle({
            model: "gemma-4-31b-it",
            temperature: 0.1,
            apiKey: process.env.GOOGLE_API_KEY || "",
        });

        const structuredModel = model.withStructuredOutput(ExtractionSchema, { name: "extract_quotes" });
        const prompt = PromptTemplate.fromTemplate(`
                You are an expert editor and curator. 
                Extract the most profound quotes about {interest} from the content provided.
                
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
                const result = await extractionChain.invoke({ content: article.content, interest });
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

    async generateQuoteEmbeddings(quotes: QuoteOutput[]): Promise<QuoteOutput[]> {
        console.log('----Generating Gemini Embeddings for Quotes----');
        const model = createGeminiEmbeddings(768);

        const quoteTexts = quotes.map(q => `Title: ${q.title}. Topics: ${q.topic.join(', ')}. Quote: ${q.quote}`);
        const embeddings = await model.embedDocuments(quoteTexts);

        return quotes.map((quote, index) => ({
            ...quote,
            embedding: embeddings[index] || [],
        }));
    }

    async saveQuotes(quotes: QuoteOutput[]) {
        console.log(`----Saving ${quotes.length} Quotes----`);
        let savedCount = 0;
        try {
            for (const element of quotes) {
                const embeddingString = element.embedding ? `[${element.embedding.join(',')}]` : null;
                const result = await prisma.$executeRaw`
                        INSERT INTO "Quotes" (
                            "id", "title", "author", "publication", "src", 
                            "datePublished", "quote", "topic", "thumbnail", "favicon", "embedding"
                        ) VALUES (
                            gen_random_uuid(),
                            ${element.title}, 
                            ${element.author}, 
                            ${element.publication}, 
                            ${element.src}, 
                            ${new Date(element.datePublished)}, 
                            ${element.quote}, 
                            ${element.topic}, 
                            ${element.thumbnail}, 
                            ${element.favicon}, 
                            ${embeddingString}::vector
                        )
                        ON CONFLICT (src, quote) DO NOTHING
                    `;
                savedCount += result;
            }
            console.log(`Successfully saved ${savedCount} quotes.`);
        } catch (error) {
            console.error("Failed to save quotes to database:", error);
            throw error;
        }
    }

}