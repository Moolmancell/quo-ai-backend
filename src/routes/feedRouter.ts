import { Router } from "express";
import { generateQuotes } from "../controllers/feedController";
const feedRouter = Router();

//Feed Endpoints
//TODO: Create /api/feed/get-feed/:userID endpoint (using LangChain to generate feed based on interests)
//TODO: Create /api/feed/get-featured-image/:userID endpoint (use cloudinary for Image Proxy Buffer)
//TODO: Create /api/feed/get-favicon-image/:userID endpoint
//TODO: Create /api/feed/add-bookmark/:userID endpoint
//TODO: Create /api/feed/delete-bookmark/:userID endpoint
//TODO: Create /api/feed/gen-feed endpoint
feedRouter.post('/gen-feed', generateQuotes)

export default feedRouter;