import twilio from "twilio";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

// Twilio Video rooms and the access tokens that let the app join them.

const { AccessToken } = twilio.jwt;
const { VideoGrant } = AccessToken;

function credentials() {
  const { accountSid, apiKeySid, apiKeySecret } = env.twilio;
  if (!accountSid || !apiKeySid || !apiKeySecret) throw new ApiError(500, "Video calls are not configured");
  return { accountSid, apiKeySid, apiKeySecret };
}

let client: twilio.Twilio | null = null;
const getClient = () => {
  const { accountSid, apiKeySid, apiKeySecret } = credentials();
  client ??= twilio(apiKeySid, apiKeySecret, { accountSid });
  return client;
};

/**
 * Makes sure the room is open, so it starts with our limits: each person can
 * stay at most `maxMinutes`, and an empty room closes after 5 minutes.
 */
export async function openRoom(name: string, maxMinutes: number) {
  const rooms = getClient().video.v1.rooms;
  try {
    return await rooms.create({
      uniqueName: name,
      type: "group",
      maxParticipants: 2,
      maxParticipantDuration: maxMinutes * 60,
      emptyRoomTimeout: 5,
      unusedRoomTimeout: 5,
    });
  } catch (error) {
    // 53113: a room with this name is already open. Join that one.
    if ((error as { code?: number }).code === 53113) return rooms(name).fetch();
    console.error("Twilio Video room error:", error);
    throw new ApiError(502, "Could not open the video room. Please try again");
  }
}

/** A token to join one room, valid for `minutes`. */
export function videoToken(identity: string, room: string, minutes: number) {
  const { accountSid, apiKeySid, apiKeySecret } = credentials();
  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, { identity, ttl: minutes * 60 });
  token.addGrant(new VideoGrant({ room }));
  return token.toJwt();
}
