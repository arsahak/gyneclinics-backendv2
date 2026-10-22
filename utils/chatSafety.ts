// Words that make the team look at a chat message. The message is still
// delivered: urgent-health words so the doctor and team can act quickly,
// abusive words so the team can warn or suspend.

import type { MessageFlag } from "../models/chatMessage.model";

const URGENT_HEALTH = [
  /\b(heavy|a lot of|lots of|soaking)\b[^.!?]{0,30}\bbleed(ing)?\b/i,
  /\bbleed(ing)?\b[^.!?]{0,20}\b(a lot|heavily|won'?t stop|not stopping)\b/i,
  /\b(severe|unbearable|extreme|worst)\b[^.!?]{0,20}\bpain\b/i,
  /\b(faint(ed|ing)?|passed out|pass(ing)? out|unconscious|can'?t breathe|cannot breathe)\b/i,
  /\b(suicid(e|al)|kill myself|end my life|self[- ]harm|hurt myself)\b/i,
];

const ABUSE = [/\b(idiot|stupid|useless|moron|shut up|f+u+c+k\w*|bitch|bastard|asshole|dumb)\b/i];

/** The most important flag in a message (urgent health first) and what matched. */
export function findMessageFlag(text: string): { kind: MessageFlag; match: string } | null {
  for (const pattern of URGENT_HEALTH) {
    const found = text.match(pattern);
    if (found) return { kind: "urgent_health", match: found[0].trim() };
  }
  for (const pattern of ABUSE) {
    const found = text.match(pattern);
    if (found) return { kind: "abuse", match: found[0].trim() };
  }
  return null;
}
