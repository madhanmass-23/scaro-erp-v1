import { Router } from "express";
import { leaveController } from "../controllers/leave.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All leave routes require authentication
router.use(authenticate);

// Leave request routes
router.get("/", (req, res, next) => leaveController.listLeaveRequests(req, res, next));
router.post("/", (req, res, next) => leaveController.createLeaveRequest(req, res, next));
router.get("/:id", (req, res, next) => leaveController.getLeaveRequestById(req, res, next));
router.patch("/:id", (req, res, next) => leaveController.updateLeaveRequest(req, res, next));

export default router;
