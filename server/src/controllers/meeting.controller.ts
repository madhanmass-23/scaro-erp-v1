import { Request, Response, NextFunction } from "express";
import { meetingService } from "../services/meeting.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { MeetingListFilter } from "../repositories/meeting.repository.js";

export class MeetingController {
  private async getAuthContext(req: Request): Promise<UserRoleInfo> {
    if (req.auth) {
      return req.auth;
    }
    if (!req.user?.id) {
      throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
    }
    const roleInfo = await rbacService.getUserRoleAndPermissions(req.user.id);
    req.auth = roleInfo;
    return roleInfo;
  }

  /**
   * GET /api/v1/meetings
   */
  async listMeetings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);

      const filter: MeetingListFilter = {};
      if (typeof req.query.date === "string" && req.query.date.trim()) {
        filter.date = req.query.date.trim();
      }
      if (typeof req.query.from === "string" && req.query.from.trim()) {
        filter.from = req.query.from.trim();
      }
      if (typeof req.query.to === "string" && req.query.to.trim()) {
        filter.to = req.query.to.trim();
      }
      if (typeof req.query.status === "string" && req.query.status.trim()) {
        filter.status = req.query.status.trim();
      }
      if (typeof req.query.search === "string" && req.query.search.trim()) {
        filter.search = req.query.search.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await meetingService.listMeetings(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.meetings, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/meetings/:id
   */
  async getMeetingById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const meeting = await meetingService.getMeetingById(id, auth);
      sendSuccess(res, meeting);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/meetings
   */
  async createMeeting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const meeting = await meetingService.createMeeting(req.body, auth);
      sendSuccess(res, meeting, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/meetings/:id
   */
  async updateMeeting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const meeting = await meetingService.updateMeeting(id, req.body, auth);
      sendSuccess(res, meeting);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/meetings/:id/participants
   */
  async getParticipants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const participants = await meetingService.getParticipants(id, auth);
      sendSuccess(res, participants);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/meetings/:id/participants
   */
  async addParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const targetUserId = req.body.user_id || req.body.participant_id;
      if (!targetUserId || typeof targetUserId !== "string") {
        throw new AppError("target participant user_id is required in request body", 400, "INVALID_USER_ID");
      }
      const participant = await meetingService.addParticipant(id, targetUserId.trim(), auth);
      sendSuccess(res, participant, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/meetings/:id/participants/:userId
   */
  async removeParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const userId = String(req.params.userId);
      const result = await meetingService.removeParticipant(id, userId, auth);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/meetings/:id/attendance
   */
  async getAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const records = await meetingService.getAttendance(id, auth);
      sendSuccess(res, records);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/meetings/:id/attendance
   */
  async recordAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const targetUserId = req.body.user_id || req.body.participant_id || auth.userId;
      const record = await meetingService.recordAttendance(
        id,
        String(targetUserId),
        req.body,
        auth
      );
      sendSuccess(res, record, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/meetings/:id/attendance/:userId
   */
  async updateAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const userId = String(req.params.userId);
      const record = await meetingService.recordAttendance(
        id,
        userId,
        req.body,
        auth
      );
      sendSuccess(res, record);
    } catch (err) {
      next(err);
    }
  }
}

export const meetingController = new MeetingController();
