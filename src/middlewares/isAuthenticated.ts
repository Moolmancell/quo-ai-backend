import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth'; // Path to your Better Auth server instance
import { fromNodeHeaders } from "better-auth/node";

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  // Better Auth needs headers converted to a standard format
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    return res.status(401).json({ message: "Unauthorized: Please sign in." });
  }

  // Store the session in res.locals for use in the controller
  res.locals.session = session;
  next();
};
