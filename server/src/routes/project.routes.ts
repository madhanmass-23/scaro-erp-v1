import { Router } from "express";
import { projectController } from "../controllers/project.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";

const router = Router();

// Project collection routes
router.get("/", authenticate, projectController.getProjects.bind(projectController));
router.post("/", authenticate, requirePermission("projects.manage"), projectController.createProject.bind(projectController));

// Single project routes
router.get("/:id", authenticate, projectController.getProjectById.bind(projectController));
router.patch("/:id", authenticate, projectController.updateProject.bind(projectController));

// Project members routes
router.get("/:id/members", authenticate, projectController.getMembers.bind(projectController));
router.post("/:id/members", authenticate, projectController.addMember.bind(projectController));
router.delete("/:id/members/:userId", authenticate, projectController.removeMember.bind(projectController));

export default router;
