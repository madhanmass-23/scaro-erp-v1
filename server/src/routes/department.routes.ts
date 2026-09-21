import { Router } from "express";
import { departmentController } from "../controllers/department.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// All department routes require authentication
router.use(authenticate);

router.get("/", (req, res, next) => departmentController.listDepartments(req, res, next));
router.post("/", (req, res, next) => departmentController.createDepartment(req, res, next));
router.get("/:id", (req, res, next) => departmentController.getDepartmentById(req, res, next));
router.patch("/:id", (req, res, next) => departmentController.updateDepartment(req, res, next));

export default router;
