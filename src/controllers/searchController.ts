import { Request, Response } from "express";
import axios from "axios";
const metascraper = require('metascraper')([
    require('metascraper-date')(),
    require('metascraper-author')(),
    require('metascraper-publisher')(),
]);

interface SearchResult {
    id: string;
    src: string;
    title: string;
    favicon: string;
    thumbnail: string;
    snippet: string;
    datePublished: string;
    publication: string;
    author: string;
}

interface CacheEntry {
    results: SearchResult[];
    timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

function getDateSegments() {
    const now = new Date();
    const toDateStr = (d: Date) => d.toISOString().split('T')[0];

    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    return [
        {},
        { start_date: toDateStr(threeMonthsAgo) },
        { start_date: toDateStr(twelveMonthsAgo), end_date: toDateStr(threeMonthsAgo) },
        { end_date: toDateStr(twelveMonthsAgo) },
    ];
}

async function searchTavilySegment(query: string, params: Record<string, string | undefined>): Promise<SearchResult[]> {
    const cleanParams: Record<string, string> = {};
    for (const [key, val] of Object.entries(params)) {
        if (val !== undefined) {
            cleanParams[key] = val;
        }
    }
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        throw new Error("TAVILY_API_KEY is not set");
    }

    const response = await axios.post("https://api.tavily.com/search", {
        query: `site:.substack.com ${query}`,
        search_depth: "advanced",
        max_results: 20,
        include_images: true,
        include_favicon: true,
        ...cleanParams,
    }, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    });

    return (response.data.results || []).map((item: any) => ({
        id: crypto.randomUUID(),
        src: item.url,
        title: item.title,
        favicon: item.favicon || "",
        thumbnail: (item.images && item.images.length > 0) ? item.images[0] : (item.image && item.image.length > 0 ? item.image[0] : ""),
        snippet: item.content || "",
        datePublished: item.publishedDate || "",
        publication: "Substack",
        author: "",
    }));
}

async function enrichWithMetascraper(results: SearchResult[]): Promise<SearchResult[]> {
    return await Promise.all(results.map(async (result) => {
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
                result.datePublished = result.datePublished || metadata.date || "";
                result.publication = metadata.publisher || "Substack";
                result.author = metadata.author || "";
            }
        } catch (error) {
            console.error(`Error fetching metadata for ${result.src}:`, error instanceof Error ? error.message : String(error));
        }
        return result;
    }));
}

export async function searchArticles(req: Request, res: Response) {
    const q = req.query.q as string;
    const type = req.query.type as string || "Articles/Essays";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;

    if (!q || q.trim().length === 0) {
        return res.status(400).json({ success: false, message: "Search query is required." });
    }

    try {
        const cacheKey = q.trim().toLowerCase();
        const cached = searchCache.get(cacheKey);
        let results: SearchResult[];

        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            results = cached.results;
        } else {
            const segments = getDateSegments();
            const segmentResults = await Promise.all(
                segments.map(seg => searchTavilySegment(q, seg))
            );

            const seen = new Map<string, SearchResult>();
            for (const segment of segmentResults) {
                for (const result of segment) {
                    if (!seen.has(result.src)) {
                        seen.set(result.src, result);
                    }
                }
            }
            results = Array.from(seen.values());

            searchCache.set(cacheKey, { results, timestamp: Date.now() });
        }

        const startIdx = (page - 1) * limit;
        const pageResults = results.slice(startIdx, startIdx + limit);

        const enrichedResults = await enrichWithMetascraper(pageResults);

        return res.status(200).json({
            success: true,
            data: enrichedResults,
            hasMore: startIdx + limit < results.length,
        });
    } catch (error) {
        console.error("Search error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to perform search."
        });
    }
}
