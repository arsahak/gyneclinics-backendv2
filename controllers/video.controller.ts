import type { Request, Response } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { openRoom, videoToken } from "../utils/video";

/** Length of the test call. Twilio removes each person after this. */
export const TEST_CALL_MINUTES = 30;

/**
 * Joins the shared test room, so a doctor and a patient can try a video call.
 * Identity is "role|name|id"; the app shows the name.
 */
export const joinTestCall = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const roomName = `${env.twilio.roomPrefix}-test-call`;
  const room = await openRoom(roomName, TEST_CALL_MINUTES);
  const name = (user.fullName || (user.role === "doctor" ? "Doctor" : "Patient")).replace(/\|/g, " ").slice(0, 60);
  const identity = `${user.role}|${name}|${user.id}`;

  return ApiResponse(res, 200, "Ready to join the test call", {
    token: videoToken(identity, roomName, TEST_CALL_MINUTES + 5),
    roomName,
    roomSid: room.sid,
    identity,
    maxMinutes: TEST_CALL_MINUTES,
  });
});
