import { Request, Response, NextFunction } from "express";
import { messageService } from "../services/message.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { MessageListFilter } from "../repositories/message.repository.js";

export class MessageController {
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
   * GET /api/v1/messages
   */
  listMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);

      const filter: MessageListFilter = {};
      if (typeof req.query.peer_id === "string" && req.query.peer_id.trim()) {
        filter.peer_id = req.query.peer_id.trim();
      }
      if (typeof req.query.task_id === "string" && req.query.task_id.trim()) {
        filter.task_id = req.query.task_id.trim();
      }
      if (typeof req.query.search === "string" && req.query.search.trim()) {
        filter.search = req.query.search.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await messageService.listMessages(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.messages, result.pagination);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/messages/conversations
   */
  listConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const conversations = await messageService.listConversations(auth);
      sendSuccess(res, conversations);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/messages/conversations/:peerId
   */
  getConversationMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const peerId = String(req.params.peerId || "");

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "50"), 10) || 50;

      const result = await messageService.getConversationMessages(peerId, { page, limit }, auth);
      sendPaginatedSuccess(res, result.messages, result.pagination);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/messages/:id
   */
  getMessageById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      const message = await messageService.getMessageById(id, auth);
      sendSuccess(res, message);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/messages
   */
  sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const { recipient_id, task_id, content } = req.body;

      const message = await messageService.sendMessage(
        {
          recipient_id,
          task_id,
          content,
        },
        auth
      );

      sendSuccess(res, message, 201);
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/messages/:id/read
   */
  markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      await messageService.markAsRead(id, auth);
      sendSuccess(res, { id, is_read: true });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/messages/conversations/:peerId/read
   */
  markConversationAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const peerId = String(req.params.peerId || "");
      const result = await messageService.markConversationAsRead(peerId, auth);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}

export const messageController = new MessageController();
