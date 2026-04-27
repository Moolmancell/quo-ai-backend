import { Router } from "express";
import { generateQuotesByInterests } from "../controllers/adminController";
const adminRouter = Router();

adminRouter.post('/gen-quotes-by-interests', generateQuotesByInterests)

export default adminRouter;