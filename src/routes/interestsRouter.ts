import { Router } from "express";

const interestsRouter = Router();

// TODO: Create /api/interests/get-interests/:userID endpoint
//TODO: Create /api/interests/submit-interests/:userID endpoint
//TODO: Create /api/interests/generate-interests/:userID endpoint (Transform.js for interest generation (Cloud Worker AI))
interestsRouter.get("/get-interests/:userID", (req, res) => res.send('get-interests endpoint not implemented yet'));
interestsRouter.post("/submit-interests/:userID", (req, res) => res.send('submit-interests endpoint not implemented yet'));
interestsRouter.get("/generate-interests/:userID", (req, res) => res.send('generate-interests endpoint not implemented yet'));

export default interestsRouter;