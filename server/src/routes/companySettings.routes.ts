import { Router } from "express";
import { companySettingsController } from "../controllers/companySettings.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All company settings routes require authentication
router.use(authenticate);

router.get("/", (req, res, next) => companySettingsController.getSettings(req, res, next));
router.patch("/", (req, res, next) => companySettingsController.updateSettings(req, res, next));

export default router;
