// Where a consultation is now, worked out from its status and start time.
// Same rules as the webapp (webapp/lib/consultation.ts, CONSULTATION_POLICY):
// the chat is open for SESSION_HOURS from the start, then the free follow-up
// runs FOLLOW_UP_DAYS more.

export const SESSION_HOURS = 24;
export const FOLLOW_UP_DAYS = 7;

export const CONSULTATION_STAGES = ["upcoming", "live", "follow_up", "completed", "cancelled", "refunded"] as const;
export type ConsultationStage = (typeof CONSULTATION_STAGES)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function consultationTimes(startsAt: Date) {
  const sessionEndsAt = new Date(startsAt.getTime() + SESSION_HOURS * HOUR);
  const followUpEndsAt = new Date(sessionEndsAt.getTime() + FOLLOW_UP_DAYS * DAY);
  return { sessionEndsAt, followUpEndsAt };
}

/** "completed" status = the doctor closed the chat early, so it goes straight to follow-up. */
export function stageOf(c: { status: string; startsAt: Date }, now = new Date()): ConsultationStage {
  if (c.status === "refunded") return "refunded";
  if (c.status === "cancelled") return "cancelled";
  const { sessionEndsAt, followUpEndsAt } = consultationTimes(c.startsAt);
  if (now < c.startsAt) return "upcoming";
  if (now < sessionEndsAt && c.status !== "completed") return "live";
  if (now < followUpEndsAt) return "follow_up";
  return "completed";
}

/** A Mongo filter that matches exactly the consultations stageOf() puts in `stage`. */
export function stageFilter(stage: ConsultationStage, now = new Date()): Record<string, unknown> {
  const sessionCut = new Date(now.getTime() - SESSION_HOURS * HOUR);
  const followUpCut = new Date(now.getTime() - SESSION_HOURS * HOUR - FOLLOW_UP_DAYS * DAY);
  const open = { $in: ["confirmed", "completed"] };
  switch (stage) {
    case "refunded":
    case "cancelled":
      return { status: stage };
    case "upcoming":
      return { status: open, startsAt: { $gt: now } };
    case "live":
      return { status: "confirmed", startsAt: { $lte: now, $gt: sessionCut } };
    case "follow_up":
      return {
        $or: [
          { status: "confirmed", startsAt: { $lte: sessionCut, $gt: followUpCut } },
          { status: "completed", startsAt: { $lte: now, $gt: followUpCut } },
        ],
      };
    case "completed":
      return { status: open, startsAt: { $lte: followUpCut } };
  }
}
