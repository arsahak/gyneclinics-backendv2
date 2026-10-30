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

interface RoomOptions {
  /** Twilio removes each person after this long (Twilio allows 10 minutes to 24 hours). */
  maxMinutes: number;
  /** How many people can be in the room at once. */
  maxParticipants: number;
}

/**
 * Makes sure the room is open, so it starts with our limits. An empty room
 * closes after 5 minutes. These options only apply when the room is created:
 * if it's already open, we join it as it is.
 */
export async function openRoom(name: string, { maxMinutes, maxParticipants }: RoomOptions) {
  const rooms = getClient().video.v1.rooms;
  try {
    return await rooms.create({
      uniqueName: name,
      type: "group",
      maxParticipants,
      maxParticipantDuration: Math.min(24 * 60, Math.max(10, maxMinutes)) * 60,
      emptyRoomTimeout: 5,
      unusedRoomTimeout: 5,
      mediaRegion: env.twilio.videoRegion,
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
