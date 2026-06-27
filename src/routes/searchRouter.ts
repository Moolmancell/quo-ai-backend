import { Router } from "express";
const searchRouter = Router();
import { searchArticles } from '../controllers/searchController';

searchRouter.get('/', searchArticles);

export default searchRouter;
