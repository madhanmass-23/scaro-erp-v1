import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authRateLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Public Authentication Endpoints
router.post("/login", authRateLimiter, authController.login.bind(authController));
router.post("/refresh", authController.refresh.bind(authController));
router.post("/logout", authController.logout.bind(authController));
router.post("/set-initial-password", authController.setInitialPassword.bind(authController));

// Protected Authentication Endpoints
router.get("/me", authenticate, authController.getMe.bind(authController));
router.get("/permissions", authenticate, authController.getPermissions.bind(authController));
router.post("/change-password", authenticate, authController.changePassword.bind(authController));

export default router;
