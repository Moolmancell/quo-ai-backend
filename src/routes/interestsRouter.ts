import { Router } from "express";
import { getInterests, submitInterests } from "../controllers/interestsController";
const interestsRouter = Router();

// TODO: Create /api/interests/get-interests/:userID endpoint
//TODO: Create /api/interests/submit-interests/:userID endpoint
//TODO: (OPTIONAL) Create /api/interests/generate-interests/:suserID endpoint (Transform.js for interest generation (Cloud Worker AI))
interestsRouter.get("/get-interests", getInterests);
interestsRouter.post("/submit-interests", submitInterests);
interestsRouter.get("/generate-interests/:userID", (req, res) => res.send('generate-interests endpoint not implemented yet'));

export default interestsRouter;