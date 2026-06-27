import { Request, Response } from "express";
import { TavilySearch } from "@langchain/tavily";
import axios from "axios";
const metascraper = require('metascraper')([
    require('metascraper-date')(),
    require('metascraper-author')(),
    require('metascraper-publisher')(),
]);

export async function searchArticles(req: Request, res: Response) {
    const q = req.query.q as string;
    const type = req.query.type as string || "Articles/Essays";
    const page = parseInt(req.query.page as string) || 1;

    if (!q || q.trim().length === 0) {
        return res.status(400).json({ success: false, message: "Search query is required." });
    }

    const maxResults = 10;
    const offset = (page - 1) * maxResults;

    try {
        const tool = new TavilySearch({
            maxResults,
            includeFavicon: true,
            includeImages: true,
            includeRawContent: false
        });

        const response = await tool.invoke({
            query: `site:.substack.com ${q}`,
            searchDepth: "advanced",
            offset
        } as any);

        const results = (response.results || []).map((item: any) => ({
            src: item.url,
            title: item.title,
            favicon: item.favicon,
            thumbnail: (item.images && item.images.length > 0) ? item.images[0] : (item.image && item.image.length > 0 ? item.image[0] : ""),
            content: item.content || "",
            datePublished: "",
            publication: "Substack",
            author: ""
        }));

        const enrichedResults = await Promise.all(results.map(async (result: any) => {
            try {
                const htmlResponse = await axios.get(result.src, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                const html = htmlResponse.data;
                const url = htmlResponse.config.url || result.src;
                const metadata = await metascraper({ html, url });

                if (metadata) {
                    result.datePublished = metadata.date || "";
                    result.publication = metadata.publisher || "Substack";
                    result.author = metadata.author || "";
                }
            } catch (error) {
                console.error(`Error fetching metadata for ${result.src}:`, error instanceof Error ? error.message : String(error));
            }
            return result;
        }));

        return res.status(200).json({
            success: true,
            count: enrichedResults.length,
            page,
            data: enrichedResults
        });
    } catch (error) {
        console.error("Search error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to perform search."
        });
    }
}
