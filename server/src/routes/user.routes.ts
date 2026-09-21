import { Router } from "express";
import { userController } from "../controllers/user.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";

const router = Router();

// 1. Current user endpoints (Must precede /:id parameterized routes)
router.get("/me", authenticate, userController.getMe.bind(userController));
router.patch("/me", authenticate, userController.updateMe.bind(userController));

// 2. Workforce directory list endpoint (Management permission: users.view)
router.get("/", authenticate, requirePermission("users.view"), userController.getUsers.bind(userController));

// 3. User by ID endpoints
router.get("/:id", authenticate, userController.getUserById.bind(userController));
router.patch("/:id", authenticate, requirePermission("users.manage"), userController.updateUserById.bind(userController));

export default router;
