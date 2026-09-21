import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";

const router = Router();

router.get("/health", healthController.getHealth.bind(healthController));
router.get("/health/db", healthController.getDatabaseHealth.bind(healthController));

export default router;
