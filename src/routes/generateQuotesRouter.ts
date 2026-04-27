import { Router } from "express";
import { generateQuotes } from "../controllers/generateQuotesController";
const generateQuotesRouter = Router();

generateQuotesRouter.post('/', generateQuotes)

export default generateQuotesRouter;