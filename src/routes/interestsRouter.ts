import { Router } from "express";
import { getInterests, submitInterests } from "../controllers/interestsController";
const interestsRouter = Router();

interestsRouter.get("/get-interests", getInterests);
interestsRouter.post("/submit-interests", submitInterests);
//TODO: (OPTIONAL) Create /api/interests/generate-interests/:suserID endpoint (Transform.js for interest generation (Cloud Worker AI))

export default interestsRouter;