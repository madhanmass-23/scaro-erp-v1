import { Router } from "express";
import { auditController } from "../controllers/audit.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All audit routes require authentication (and management authorization)
router.use(authenticate);

router.get("/", (req, res, next) => auditController.listAuditLogs(req, res, next));
router.get("/:id", (req, res, next) => auditController.getAuditLogById(req, res, next));

export default router;
