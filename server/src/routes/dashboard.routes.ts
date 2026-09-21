import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

router.get("/summary", (req, res, next) => dashboardController.getDashboardSummary(req, res, next));

export default router;
