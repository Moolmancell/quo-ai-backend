import express from "express";
import { signUpController } from "../controllers/signupController";

const signUpRouter = express.Router();

signUpRouter.post("/", signUpController);

export default signUpRouter;