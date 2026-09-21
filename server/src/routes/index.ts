import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import projectRoutes from "./project.routes.js";
import taskRoutes from "./task.routes.js";
import attendanceRoutes from "./attendance.routes.js";
import dailyReportRoutes from "./dailyReport.routes.js";
import meetingRoutes from "./meeting.routes.js";
import leaveRoutes from "./leave.routes.js";
import messageRoutes from "./message.routes.js";
import notificationRoutes from "./notification.routes.js";
import announcementRoutes from "./announcement.routes.js";
import companySettingsRoutes from "./companySettings.routes.js";
import departmentRoutes from "./department.routes.js";
import auditRoutes from "./audit.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import systemRoutes from "./system.routes.js";
import storageRoutes from "./storage.routes.js";

const apiRouter = Router();

// Mount feature route groups
apiRouter.use("/", healthRoutes);
apiRouter.use("/auth", authRoutes);
apiRouter.use("/users", userRoutes);
apiRouter.use("/projects", projectRoutes);
apiRouter.use("/tasks", taskRoutes);
apiRouter.use("/attendance", attendanceRoutes);
apiRouter.use("/daily-reports", dailyReportRoutes);
apiRouter.use("/meetings", meetingRoutes);
apiRouter.use("/leave-requests", leaveRoutes);
apiRouter.use("/messages", messageRoutes);
apiRouter.use("/notifications", notificationRoutes);
apiRouter.use("/announcements", announcementRoutes);
apiRouter.use("/company-settings", companySettingsRoutes);
apiRouter.use("/departments", departmentRoutes);
apiRouter.use("/audit-logs", auditRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/system", systemRoutes);
apiRouter.use("/storage", storageRoutes);

export default apiRouter;


