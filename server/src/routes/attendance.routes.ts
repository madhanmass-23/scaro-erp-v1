import { Router } from "express";
import { attendanceController } from "../controllers/attendance.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// Work-time tracking endpoints
router.post("/sign-in", authenticate, attendanceController.signIn.bind(attendanceController));
router.get("/current", authenticate, attendanceController.getCurrentSession.bind(attendanceController));
router.post("/sign-out", authenticate, attendanceController.signOut.bind(attendanceController));
router.get("/history", authenticate, attendanceController.getHistory.bind(attendanceController));
router.get("/management", authenticate, attendanceController.getManagementAttendance.bind(attendanceController));

export default router;
