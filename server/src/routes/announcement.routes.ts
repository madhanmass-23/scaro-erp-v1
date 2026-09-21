import { Router } from "express";
import { announcementController } from "../controllers/announcement.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All announcement routes require authentication
router.use(authenticate);

// Announcement collection routes
router.get("/", (req, res, next) => announcementController.listAnnouncements(req, res, next));
router.post("/", (req, res, next) => announcementController.createAnnouncement(req, res, next));

// Single announcement routes
router.get("/:id", (req, res, next) => announcementController.getAnnouncementById(req, res, next));
router.patch("/:id", (req, res, next) => announcementController.updateAnnouncement(req, res, next));
router.put("/:id", (req, res, next) => announcementController.updateAnnouncement(req, res, next));

export default router;
