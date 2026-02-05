import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import cors from "cors";
const app = express();
import interestsRouter from "./routes/interestsRouter";
import { isAuthenticated } from "./middlewares/isAuthenticated";
import feedRouter from "./routes/feedRouter";

const corsOptions = {
  origin: process.env.ORIGIN_URL || 'http://localhost:3000', 
  credentials: true,
};
app.use(express.json());
app.use(cors(corsOptions));

app.all('/api/auth/{*any}', toNodeHandler(auth));

//Interest Check Endpoints
app.use('/api/interests', isAuthenticated, interestsRouter);
//TODO: Create a /admin endpoint to manage quotes
app.use('/api/feed', isAuthenticated, feedRouter);

export default app;
