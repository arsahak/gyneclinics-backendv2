import { StaffNotification, type StaffEvent } from "../models/staffNotification.model";
import { STAFF_ROLES, User, type StaffRole } from "../models/user.model";
import { emitStaffNotification } from "../realtime/messagesRealtime";
import { allows, getAccess, type AreaKey } from "./permissions";

// Tells the dashboard team that something happened: a dashboard notification
// for every active staff member whose role can see one of the areas (Team &
// Roles), pushed live over socket.io. It never breaks the action that caused it.

export interface StaffAlert {
  type: StaffEvent;
  /** Who should know: staff who can view any of these. */
  areas: AreaKey[];
  title: string;
  body: string;
  link?: string;
  priority?: "normal" | "urgent";
}

export async function alertStaff(alert: StaffAlert): Promise<number> {
  try {
    const [staff, access] = await Promise.all([
      User.find({ role: { $in: STAFF_ROLES }, isActive: true }).select("role").lean<{ _id: unknown; role: StaffRole }[]>(),
      getAccess(),
    ]);
    const recipients = staff.filter((s) => alert.areas.some((a) => allows(access[s.role]?.[a], "view")));
    if (!recipients.length) return 0;
    const docs = await StaffNotification.insertMany(
      recipients.map((s) => ({
        user: s._id,
        type: alert.type,
        title: alert.title.slice(0, 120),
        body: alert.body.slice(0, 400),
        link: alert.link,
        priority: alert.priority ?? "normal",
      }))
    );
    const unread = await StaffNotification.aggregate<{ _id: unknown; n: number }>([
      { $match: { user: { $in: recipients.map((r) => r._id) }, readAt: { $exists: false } } },
      { $group: { _id: "$user", n: { $sum: 1 } } },
    ]);
    for (const doc of docs) {
      const id = String(doc.user);
      emitStaffNotification(id, { notification: doc.toJSON(), unread: unread.find((u) => String(u._id) === id)?.n ?? 1 });
    }
    return docs.length;
  } catch (error) {
    console.error(`Staff alert (${alert.type}) failed: ${(error as Error).message}`);
    return 0;
  }
}

/** "£40", "$13" */
export const moneyText = (amount: number, currency: string) => `${currency === "GBP" ? "£" : currency === "USD" ? "$" : `${currency} `}${amount}`;
