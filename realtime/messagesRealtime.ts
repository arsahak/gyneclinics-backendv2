import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { env } from "../config/env";

// Socket.io for live updates (path /socket.io). A browser connects with a
// short-lived ticket from the API (never its login token):
//   message-realtime: chat updates (staff, or one conversation)
//   staff-realtime:   one staff member's dashboard notifications (room staff:<id>)
//   user-realtime:    one patient's or doctor's inbox in the app (room user:<id>)
// It runs on the long-running server (server.ts). Where there's no such server
// (e.g. Vercel), emits do nothing and the dashboard falls back to polling.

type RealtimeTicket =
  | { type: "message-realtime"; scope: "staff" | "conversation"; conversationId?: string }
  | { type: "staff-realtime"; userId: string }
  | { type: "user-realtime"; userId: string };

let io: Server | null = null;

export const createMessageRealtimeTicket = (scope: "staff" | "conversation", conversationId?: string) =>
  jwt.sign({ type: "message-realtime", scope, conversationId } satisfies RealtimeTicket, env.jwtSecret, { expiresIn: "15m" });

export const createStaffRealtimeTicket = (userId: string) =>
  jwt.sign({ type: "staff-realtime", userId } satisfies RealtimeTicket, env.jwtSecret, { expiresIn: "15m" });

export const createUserRealtimeTicket = (userId: string) =>
  jwt.sign({ type: "user-realtime", userId } satisfies RealtimeTicket, env.jwtSecret, { expiresIn: "15m" });

export const initializeMessagesRealtime = (server: HttpServer) => {
  io = new Server(server, {
    path: "/socket.io",
    cors: {
      origin: env.isProduction ? env.clientUrls : true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const ticket = String(socket.handshake.auth?.ticket || "");
      const payload = jwt.verify(ticket, env.jwtSecret) as RealtimeTicket;
      if (!["message-realtime", "staff-realtime", "user-realtime"].includes(payload.type)) throw new Error("Invalid ticket");
      socket.data.ticket = payload;
      next();
    } catch {
      next(new Error("Unauthorized realtime connection"));
    }
  });

  io.on("connection", (socket) => {
    const ticket = socket.data.ticket as RealtimeTicket;
    if (ticket.type === "staff-realtime") {
      socket.join(`staff:${ticket.userId}`);
      return;
    }
    if (ticket.type === "user-realtime") {
      socket.join(`user:${ticket.userId}`);
      return;
    }
    if (ticket.scope === "staff") socket.join("messages:staff");
    if (ticket.scope === "conversation" && ticket.conversationId) {
      socket.join(`messages:conversation:${ticket.conversationId}`);
    }
  });

  return io;
};

export const emitConversationUpdated = (conversationId: string, payload: unknown) => {
  io?.to("messages:staff").emit("messages:conversation-updated", payload);
  io?.to(`messages:conversation:${conversationId}`).emit("messages:conversation-updated", payload);
};

export const emitNewMessage = (conversationId: string, payload: unknown) => {
  io?.to("messages:staff").emit("messages:new", payload);
  io?.to(`messages:conversation:${conversationId}`).emit("messages:new", payload);
};

/** A staff member's new dashboard notification, and their unread count. */
export const emitStaffNotification = (userId: string, payload: unknown) => {
  io?.to(`staff:${userId}`).emit("staff:notification", payload);
};

/** Read state changed (e.g. on another tab): send the new unread count. */
export const emitStaffUnread = (userId: string, unread: number) => {
  io?.to(`staff:${userId}`).emit("staff:unread", { unread });
};

/** A patient's or doctor's new inbox item, and their unread count. */
export const emitUserNotification = (userId: string, payload: unknown) => {
  io?.to(`user:${userId}`).emit("notification:new", payload);
};

/** Read state changed (another tab or device): the new unread count. */
export const emitUserUnread = (userId: string, unread: number) => {
  io?.to(`user:${userId}`).emit("notification:unread", { unread });
};
