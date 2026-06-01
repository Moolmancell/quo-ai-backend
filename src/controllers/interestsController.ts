import { prisma } from '../lib/prisma';
import { Request, Response } from 'express';
import { createGeminiEmbeddings } from '../lib/gemini-embedings';

export async function getInterests(req: Request, res: Response) {
  const userSession = res.locals.session;
  const userID = userSession.user.id;

  try {
    // 1. Fetch the user and select only the topics from the relation
    const user = await prisma.user.findUnique({
      where: { id: userID },
      select: {
        userInterests: {
          select: {
            topic: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Map the array of objects [{ topic: "..." }] into a flat string array ["..."]
    const interestsArray = user.userInterests.map((item) => item.topic);

    // 3. Return it in the exact same shape as before
    return res.status(200).json({
      interests: interestsArray,
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
  
  if (!interests || !Array.isArray(interests)) {
    return res.status(400).json({ message: "Interests are required as an array." });
  }

  const interestsArray = interests.slice(0, 10); // Limit to 10 interests

  try {
    const embeddings = createGeminiEmbeddings();

    // 1. Generate Global Embedding
    const globalInterestString = `The user is interested in: ${interestsArray.join(", ")}`;
    const globalVector = await embeddings.embedQuery(globalInterestString);

    if (!globalVector) {
      throw new Error("Global embedding generation failed");
    }

    // 2. Generate Individual Topic Embeddings in batch
    const topicStrings = interestsArray.map((topic: string) => `Topic: ${topic}`);
    const individualEmbeddings = await embeddings.embedDocuments(topicStrings);
    
    const individualResults = interestsArray.map((topic, index) => ({
      topic,
      embedding: individualEmbeddings[index]
    }));

    // 3. Database Transaction
    await prisma.$transaction(async (tx) => {
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
