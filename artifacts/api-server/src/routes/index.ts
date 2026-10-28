import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workshopsRouter from "./workshops";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workshopsRouter);

export default router;
