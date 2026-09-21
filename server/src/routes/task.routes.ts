import { Router } from "express";
import { taskController } from "../controllers/task.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// Task collection routes
router.get("/", authenticate, taskController.getTasks.bind(taskController));
router.post("/", authenticate, taskController.createTask.bind(taskController));

// Single task routes
router.get("/:id", authenticate, taskController.getTaskById.bind(taskController));
router.patch("/:id", authenticate, taskController.updateTask.bind(taskController));

// Task comments routes
router.get("/:id/comments", authenticate, taskController.getComments.bind(taskController));
router.post("/:id/comments", authenticate, taskController.addComment.bind(taskController));

// Task attachment routes
router.get("/:id/attachments", authenticate, taskController.getAttachments.bind(taskController));
router.post("/:id/attachments", authenticate, taskController.addAttachment.bind(taskController));
router.delete("/:id/attachments/:attachmentId", authenticate, taskController.deleteAttachment.bind(taskController));

export default router;
