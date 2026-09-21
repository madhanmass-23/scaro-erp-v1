import { Router } from "express";
import { systemController } from "../controllers/system.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All system routes require authentication
router.use(authenticate);

router.get("/info", (req, res, next) => systemController.getSystemInfo(req, res, next));

export default router;
