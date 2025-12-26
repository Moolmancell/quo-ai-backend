import express from "express";
import loginRouter from "./routes/loginRouter";
import signUpRouter from "./routes/signupRouter";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
const app = express();

app.all('/api/auth/{*any}', toNodeHandler(auth));

app.use(express.json());

app.use("/api/login", loginRouter);
app.use("/api/signup", signUpRouter);

export default app;
