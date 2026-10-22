// Finds contact details in text, so people keep talking inside GyneClinics.
// Same rules as the webapp (webapp/lib/chat-guard.ts), so the app's instant
// check and the server agree.

export type BlockedReason = "phone" | "email" | "link" | "social";

const RULES: Array<{ reason: BlockedReason; pattern: RegExp }> = [
  { reason: "email", pattern: /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}/i },
  { reason: "phone", pattern: /(\+?\d[\d\s().-]{7,}\d)/ },
  { reason: "link", pattern: /\b(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|me|co|uk|bd|in|info|app|link)\b/i },
  {
    reason: "social",
    pattern: /\b(whats\s?app|telegram|viber|imo|signal|wechat|insta(gram)?|facebook|messenger|snap(chat)?|tiktok)\b|(^|\s)@[a-z0-9_.]{3,}/i,
  },
];

const LABELS: Record<BlockedReason, string> = {
  phone: "phone numbers",
  email: "email addresses",
  link: "links or websites",
  social: "social media or messaging handles",
};

export function scanForContactDetails(text: string): BlockedReason[] {
  return RULES.filter(({ pattern }) => pattern.test(text)).map(({ reason }) => reason);
}

export function describeBlocked(reasons: BlockedReason[]) {
  const labels = reasons.map((r) => LABELS[r]);
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : labels[0];
  return `For your safety, ${list} can't be shared here. Please keep all communication inside GyneClinics.`;
}

/** The first contact detail in the text and the exact part that matched. */
export function findContactDetail(text: string): { reason: BlockedReason; match: string } | null {
  for (const { reason, pattern } of RULES) {
    const found = text.match(pattern);
    if (found) return { reason, match: found[0].trim() };
  }
  return null;
}
