import { Router } from "express";
import { dailyReportController } from "../controllers/dailyReport.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// Specific named sub-routes MUST come before parameterized /:id routes
router.get("/today", authenticate, dailyReportController.getTodayReport.bind(dailyReportController));

// Collection routes
router.get("/", authenticate, dailyReportController.listReports.bind(dailyReportController));
router.post("/", authenticate, dailyReportController.createReport.bind(dailyReportController));

// Single report routes
router.get("/:id", authenticate, dailyReportController.getReportById.bind(dailyReportController));
router.patch("/:id", authenticate, dailyReportController.updateReport.bind(dailyReportController));

// Report task items routes
router.get("/:id/tasks", authenticate, dailyReportController.getReportTasks.bind(dailyReportController));
router.post("/:id/tasks", authenticate, dailyReportController.addReportTask.bind(dailyReportController));
router.patch("/:id/tasks/:taskId", authenticate, dailyReportController.updateReportTask.bind(dailyReportController));

// Report attachment metadata routes
router.get("/:id/attachments", authenticate, dailyReportController.getAttachments.bind(dailyReportController));
router.post("/:id/attachments", authenticate, dailyReportController.addAttachment.bind(dailyReportController));
router.delete("/:id/attachments/:attachmentId", authenticate, dailyReportController.deleteAttachment.bind(dailyReportController));

// Report sync metadata route
router.get("/:id/sync", authenticate, dailyReportController.getSyncStatus.bind(dailyReportController));

export default router;
