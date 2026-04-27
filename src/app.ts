import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import cors from "cors";
const app = express();
import interestsRouter from "./routes/interestsRouter";
import { isAuthenticated } from "./middlewares/isAuthenticated";
import feedRouter from "./routes/feedRouter";
import generateQuotesRouter from "./routes/generateQuotesRouter";
import adminRouter from "./routes/adminRouter";

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
app.use('/api/feed', isAuthenticated, feedRouter);

//Generate Quotes Endpoints
app.use('/api/gen-quotes', isAuthenticated, generateQuotesRouter);

//Admin endpoints
app.use('/api/admin', isAuthenticated, adminRouter);

export default app;
