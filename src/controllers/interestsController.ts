import { prisma } from '../lib/prisma';
import { Request, Response } from 'express';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { TaskType } from '@google/generative-ai';

// Initialize Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY || "",
  modelName: "gemini-embedding-001", // Latest stable model
  taskType: TaskType.RETRIEVAL_DOCUMENT, // Optimized for storing in a DB
  //TODO: Error cant change output dimension?
});

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
    const vector = await embeddings.embedQuery(interestString);

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