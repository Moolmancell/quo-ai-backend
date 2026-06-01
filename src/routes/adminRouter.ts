import { Router } from "express";
import { generateQuotesByInterests, generateQuotesByInterestsV2 } from "../controllers/adminController";
import { isAdmin } from "../middlewares/isAdmin";

const adminRouter = Router();

// Apply isAdmin middleware to all routes in this router
adminRouter.use(isAdmin);

adminRouter.post('/gen-quotes-by-interests', generateQuotesByInterests)
adminRouter.post('/gen-quotes-by-interests-v2', generateQuotesByInterestsV2)

export default adminRouter;