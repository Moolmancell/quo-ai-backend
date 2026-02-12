import { Request, Response } from "express";
import { TavilySearch } from "@langchain/tavily";

async function findRSSfeeds(interests: string[]) {
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
            title: item.title
        }));
        return searchResults;
    } catch (e) {
        console.error(`Something went wrong: ${e}`);
    }
}

async function rankRSSfeeds(feeds: string[]) {

}

async function extractArticles() {

}

async function findQuotesFromArticles() {

}

async function sendQuotesToDatabase() {

}

export async function generateQuotes(req: Request, res: Response) {
    try {
        const categories = ['Technology', 'Programming', 'Philosophy', 'Video Games', 'Film'];
        const searchResults = await findRSSfeeds(categories);
        console.log(searchResults)
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
