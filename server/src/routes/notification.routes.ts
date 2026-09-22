import { Router } from "express";
import { notificationController } from "../controllers/notification.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// Special bulk/status/preference routes (MUST be defined before /:id)
router.get("/unread-count", (req, res, next) => notificationController.getUnreadCount(req, res, next));
router.patch("/read-all", (req, res, next) => notificationController.markAllAsRead(req, res, next));
router.get("/preferences", (req, res, next) => notificationController.getPreferences(req, res, next));
router.put("/preferences", (req, res, next) => notificationController.updatePreferences(req, res, next));
router.post("/reminders/check", (req, res, next) => notificationController.triggerMeetingReminders(req, res, next));
router.post("/push-subscribe", (req, res, next) => notificationController.subscribePush(req, res, next));
router.post("/push-unsubscribe", (req, res, next) => notificationController.unsubscribePush(req, res, next));

// Notification collection route
router.get("/", (req, res, next) => notificationController.listNotifications(req, res, next));

// Single notification routes
router.get("/:id", (req, res, next) => notificationController.getNotificationById(req, res, next));
router.patch("/:id/read", (req, res, next) => notificationController.markAsRead(req, res, next));

export default router;
