import { Request, Response } from "express";
import { prisma } from '../lib/prisma';
import { getCoreQuotes } from "../services/feedGenService/getCoreQuotes";
import { getRelatedQuotes } from "../services/feedGenService/getRelatedQuotes";
import { getUnrelatedQuotes } from "../services/feedGenService/getUnrelatedQuotes";

export async function getFeed(req: Request, res: Response) {
    const userId = res.locals.session?.user?.id;

    if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
        // 1. Fetch the user's interest embedding and history
        const user: {
            interestembedding: string,
            quoteHistory: string[],
            userinterests: { id: string, topic: string, embedding: string }[]
        }[] = await prisma.$queryRaw`
            SELECT "interestEmbedding"::vector as interestEmbedding, "quoteHistory",
            (SELECT json_agg(json_build_object('id', id, 'topic', topic, 'embedding', embedding::vector))
             FROM "UserInterest"
             WHERE "userId" = ${userId}
            ) as userInterests
            FROM "user"
            WHERE "id" = ${userId}
        `;
        
        const userInterests = user[0]?.userinterests || [];
        const userEmbedding = user[0]?.interestembedding;
        const quoteHistory = user[0]?.quoteHistory || [];

        if (!userEmbedding) {
            return res.status(404).json({
                success: false,
                message: "No interests found. Please set your interests first."
            });
        }

        // 2. Fetch a diversified set of quotes (70/20/10 distribution)
        // Filtering out already seen quotes using quoteHistory
        let diversifiedQuotes: any[] = [];

        const coreQuotes = await getCoreQuotes(userEmbedding, quoteHistory, 21);
        diversifiedQuotes = diversifiedQuotes.concat(coreQuotes);

        const relatedQuotes = await getRelatedQuotes(userInterests, quoteHistory, 6, diversifiedQuotes.map(q => q.id));
        diversifiedQuotes = diversifiedQuotes.concat(relatedQuotes);

        const unrelatedQuotes = await getUnrelatedQuotes(userEmbedding, quoteHistory, 3, diversifiedQuotes.map(q => q.id));
        diversifiedQuotes = diversifiedQuotes.concat(unrelatedQuotes);

        // 3. Update User History
        const newQuoteIds = diversifiedQuotes.map(q => q.id);
        if (newQuoteIds.length > 0) {
            const updatedHistory = [...new Set([...newQuoteIds, ...quoteHistory])].slice(0, 500);

            await prisma.user.update({
                where: { id: userId },
                data: { quoteHistory: updatedHistory }
            });
        }

        // 4. Shuffle the results to mix categories
        const shuffledFeed = diversifiedQuotes.sort(() => Math.random() - 0.5);

        // 5. Strip out the similarity field from the final output
        const finalFeed = shuffledFeed.map(({ similarity, ...rest }) => rest);

        return res.status(200).json({
            success: true,
            count: finalFeed.length,
            data: finalFeed
        });

    } catch (error) {
        console.error("Feed retrieval error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve feed."
        });
    }
}

export async function addBookmark(req: Request, res: Response) {
    const userId = res.locals.session?.user?.id;
    const { quoteId } = req.body;

    if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!quoteId) {
        return res.status(400).json({ success: false, message: "Quote ID is required." });
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Connect the bookmark
            await tx.user.update({
                where: { id: userId },
                data: {
                    bookmarks: {
                        connect: { id: quoteId }
                    }
                }
            });

            // 2. Fetch both the user's current embedding and the quote's embedding
            const [user]: [{ embedding: string }] = await tx.$queryRaw`
                SELECT "interestEmbedding"::vector as embedding
                FROM "user"
                WHERE id = ${userId}
                LIMIT 1
            `;

            const [quote]: [{ embedding: string }] = await tx.$queryRaw`
                SELECT embedding::vector
                FROM "Quotes"
                WHERE id = ${quoteId}
                LIMIT 1
            `;

            // 3. If quote has an embedding, calculate the new interest embedding in JS/TS
            if (quote) {
                // Prisma returns pgvector as an array of numbers (e.g., [0.12, -0.43, ...])
                const quoteEmb = JSON.parse(quote.embedding);
                const userEmb = JSON.parse(user?.embedding);

                let newEmbedding: number[];

                // Perform the 90/10 weighted average
                newEmbedding = userEmb.map((val: number, i: number) => (val * 0.9) + (quoteEmb[i] * 0.1));

                // 4. Update the user with the new embedding array
                await tx.$executeRaw`
                    UPDATE "user"
                    SET "interestEmbedding" = ${JSON.stringify(newEmbedding)}::vector
                    WHERE id = ${userId}
                `
            }
        });

        return res.status(200).json({
            success: true,
            message: "Quote bookmarked and interests updated successfully."
        });
    } catch (error) {
        console.error("Error adding bookmark:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add bookmark."
        });
    }
}

export async function deleteBookmark(req: Request, res: Response) {
    const userId = res.locals.session?.user?.id;
    const { id } = req.body;

    if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!id) {
        return res.status(400).json({ success: false, message: "Quote ID is required." });
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                bookmarks: {
                    disconnect: { id: id }
                }
            }
        });

        return res.status(200).json({
            success: true,
            message: "Quote bookmark deleted successfully."
        });
    } catch (error) {
        console.error("Error deleting bookmark:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete bookmark."
        });
    }
}