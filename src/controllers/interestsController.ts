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

  try {
    const interestString = `The user is interested in: ${interests.join(", ")}`;

    // Generate Gemini Vector (768 dimensions)
    const ai = new GoogleGenAI({});

    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: interestString,
      config: {
        outputDimensionality: 768,
      }
    });

    const vector = response.embeddings?.[0]?.values;

    if (!vector) {
      throw new Error("Embedding generation failed");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userID },
        data: { interests },
      }),
      prisma.$executeRaw`
        UPDATE "user"
        SET "interestEmbedding" = ${JSON.stringify(vector)}::vector
        WHERE id = ${userID}
      `,
    ]);

    return res.status(200).json({ message: "Interests updated successfully" });
  } catch (error) {
    console.error("Error submitting interests:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}