import { Router } from "express";
const feedRouter = Router();
import { getFeed } from '../controllers/feedController';

//Feed Endpoints
//TODO: Create /api/feed/get-featured-image/:userID endpoint (use cloudinary for Image Proxy Buffer)
//TODO: Create /api/feed/get-favicon-image/:userID endpoint
//TODO: Create /api/feed/add-bookmark/:userID endpoint
//TODO: Create /api/feed/delete-bookmark/:userID endpoint
//TODO: Create /api/feed/gen-feed endpoint

feedRouter.get('/get-feed', getFeed);
export default feedRouter;