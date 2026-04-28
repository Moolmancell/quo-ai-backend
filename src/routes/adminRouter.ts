import { Router } from "express";
import { generateQuotesByInterests } from "../controllers/adminController";
import { isAdmin } from "../middlewares/isAdmin";

const adminRouter = Router();

// Apply isAdmin middleware to all routes in this router
adminRouter.use(isAdmin);

adminRouter.post('/gen-quotes-by-interests', generateQuotesByInterests)

export default adminRouter;