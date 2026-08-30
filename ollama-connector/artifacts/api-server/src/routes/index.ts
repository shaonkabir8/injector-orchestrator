import { Router, type IRouter } from "express";
import healthRouter from "./health";
import loopRouter from "./loop";
import metricsRouter from "./metrics";
import logsRouter from "./logs";
import checkpointsRouter from "./checkpoints";
import settingsRouter from "./settings";
import modelsRouter from "./models";

const router: IRouter = Router();

router.use(healthRouter);
router.use(loopRouter);
router.use(metricsRouter);
router.use(logsRouter);
router.use(checkpointsRouter);
router.use(settingsRouter);
router.use(modelsRouter);

export default router;
