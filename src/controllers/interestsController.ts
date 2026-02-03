import { prisma } from '../lib/prisma';
import { Request, Response } from 'express';

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
  //TODO: Add interests into the vector DB as well (intrestsEmbeddding)
  console.log(req.body)
  try {
    await prisma.user.update({
      where: { id: userID },
      data: { interests: interests },
    })
    return res.status(200).json({ message: "Interests updated successfully" });
  } catch (error) {
    console.error("Error submitting interests:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}