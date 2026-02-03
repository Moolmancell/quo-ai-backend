import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import cors from "cors";
const app = express();
import interestsRouter from "./routes/interestsRouter";
import { isAuthenticated } from "./middlewares/isAuthenticated";

const corsOptions = {
  origin: process.env.ORIGIN_URL || 'http://localhost:3000', 
  credentials: true,
};
app.use(express.json());
app.use(cors(corsOptions));

app.all('/api/auth/{*any}', toNodeHandler(auth));

//Interest Check Endpoints
app.use('/api/interests', isAuthenticated, interestsRouter);

//Feed Endpoints
//TODO: Create /api/feed/get-feed/:userID endpoint (using LangChain to generate feed based on interests)
//TODO: Create /api/feed/get-featured-image/:userID endpoint (use cloudinary for Image Proxy Buffer)
//TODO: Create /api/feed/get-favicon-image/:userID endpoint
//TODO: Create /api/feed/add-bookmark/:userID endpoint
//TODO: Create /api/feed/delete-bookmark/:userID endpoint



export default app;
