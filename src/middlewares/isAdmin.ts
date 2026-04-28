import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from "better-auth/node";

export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    return res.status(401).json({ message: "Unauthorized: Please sign in." });
  }

  if (session.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin access required." });
  }

  res.locals.session = session;
  next();
};
