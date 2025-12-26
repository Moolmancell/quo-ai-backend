import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import cors from "cors";
const app = express();

const corsOptions = {
  origin: process.env.ORIGIN_URL || 'http://localhost:3000', 
  credentials: true,
};

app.use(cors(corsOptions));

app.all('/api/auth/{*any}', toNodeHandler(auth));

app.use(express.json());
export default app;
