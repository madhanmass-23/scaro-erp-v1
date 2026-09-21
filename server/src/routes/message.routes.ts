import { Router } from "express";
import { messageController } from "../controllers/message.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All message routes require authentication
router.use(authenticate);

// Conversations routes (MUST be defined before /:id)
router.get("/conversations", (req, res, next) => messageController.listConversations(req, res, next));
router.get("/conversations/:peerId", (req, res, next) => messageController.getConversationMessages(req, res, next));
router.patch("/conversations/:peerId/read", (req, res, next) => messageController.markConversationAsRead(req, res, next));

// Message collection routes
router.get("/", (req, res, next) => messageController.listMessages(req, res, next));
router.post("/", (req, res, next) => messageController.sendMessage(req, res, next));

// Single message routes
router.get("/:id", (req, res, next) => messageController.getMessageById(req, res, next));
router.patch("/:id/read", (req, res, next) => messageController.markAsRead(req, res, next));

export default router;
