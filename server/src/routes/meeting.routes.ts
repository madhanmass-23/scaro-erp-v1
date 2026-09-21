import { Router } from "express";
import { meetingController } from "../controllers/meeting.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All meeting routes require authentication
router.use(authenticate);

// Meeting collection routes
router.get("/", (req, res, next) => meetingController.listMeetings(req, res, next));
router.post("/", (req, res, next) => meetingController.createMeeting(req, res, next));

// Single meeting routes
router.get("/:id", (req, res, next) => meetingController.getMeetingById(req, res, next));
router.patch("/:id", (req, res, next) => meetingController.updateMeeting(req, res, next));

// Participant routes
router.get("/:id/participants", (req, res, next) => meetingController.getParticipants(req, res, next));
router.post("/:id/participants", (req, res, next) => meetingController.addParticipant(req, res, next));
router.delete("/:id/participants/:userId", (req, res, next) => meetingController.removeParticipant(req, res, next));

// Attendance routes
router.get("/:id/attendance", (req, res, next) => meetingController.getAttendance(req, res, next));
router.post("/:id/attendance", (req, res, next) => meetingController.recordAttendance(req, res, next));
router.patch("/:id/attendance/:userId", (req, res, next) => meetingController.updateAttendance(req, res, next));

export default router;
