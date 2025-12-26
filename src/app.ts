import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
const app = express();

app.all('/api/auth/{*any}', toNodeHandler(auth));

app.use(express.json());
export default app;
