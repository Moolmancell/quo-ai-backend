import { Request, Response } from "express";
import { prisma } from '../lib/prisma';

export function getFeed(req: Request, res: Response) {
    const userId = res.locals.session?.user?.id;   
}