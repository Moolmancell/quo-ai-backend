import { prisma } from '../lib/prisma';
import { Request, Response } from 'express';
import { GoogleGenAI } from "@google/genai";

export async function getInterests(req: Request, res: Response) {
  const userSession = res.locals.session;
  const userID = userSession.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userID },
      select: { interests: true }, // Only fetch what we need
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      interests: user.interests,
    });

  } catch (error) {
    console.error("Error fetching interests:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function submitInterests(req: Request, res: Response) {
  const userSession = res.locals.session;
  const userID = userSession.user.id;
  const { interests } = req.body; // Expecting { interests: string[] }
  console.log(req.body)
  const interestsArray = interests.slice(0, 10); // Limit to 10 interests

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || "" });

    // 1. Generate Global Embedding
    const globalInterestString = `The user is interested in: ${interestsArray.join(", ")}`;
    const globalResponse = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: globalInterestString,
      config: {
        outputDimensionality: 768,
      }
    });

    const globalVector = globalResponse.embeddings?.[0]?.values;

    if (!globalVector) {
      throw new Error("Global embedding generation failed");
    }

    // 2. Generate Individual Topic Embeddings
    const individualResults = await Promise.all(interestsArray.map(async (topic: string) => {
      const topicString = `Topic: ${topic}`;
      const res = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: topicString,
        config: {
          outputDimensionality: 768,
        }
      });
      return { topic, embedding: res.embeddings?.[0]?.values };
    }));

    // 3. Database Transaction
    await prisma.$transaction(async (tx) => {
      // Update User global interests
      await tx.user.update({
        where: { id: userID },
        data: { interests: interestsArray },
      });

      // Update User global embedding
      await tx.$executeRaw`
        UPDATE "user"
        SET "interestEmbedding" = ${JSON.stringify(globalVector)}::vector
        WHERE id = ${userID}
      `;

      // Clear old UserInterests
      await tx.$executeRaw`
        DELETE FROM "UserInterest" WHERE "userId" = ${userID}
      `;

      // Insert new UserInterests
      for (const item of individualResults) {
        if (item.embedding) {
          await tx.$executeRaw`
            INSERT INTO "UserInterest" ("id", "userId", "topic", "embedding")
            VALUES (gen_random_uuid(), ${userID}, ${item.topic}, ${JSON.stringify(item.embedding)}::vector)
          `;
        }
      }
    });

    return res.status(200).json({ message: "Interests updated successfully" });
  } catch (error) {
    console.error("Error submitting interests:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}