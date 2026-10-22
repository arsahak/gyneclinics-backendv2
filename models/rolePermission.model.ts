import mongoose, { Schema, Document } from "mongoose";

// What each staff role can open in the dashboard, set in Team & Roles. One
// document. Super admins always have full access, so they aren't stored.
//   roles.admin.payments = "view" means admins can see payments but not refund.

export const ACCESS_LEVELS = ["none", "view", "manage"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const EDITABLE_ROLES = ["admin", "moderator"] as const;
export type EditableRole = (typeof EDITABLE_ROLES)[number];

export interface IRolePermission extends Document {
  key: "roles";
  roles: Record<EditableRole, Map<string, AccessLevel>>;
  /** Newest first, last 50. */
  history: { at: Date; by?: mongoose.Types.ObjectId; changes: string[] }[];
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const levels = { type: Map, of: { type: String, enum: ACCESS_LEVELS } };

const rolePermissionSchema = new Schema<IRolePermission>(
  {
    key: { type: String, enum: ["roles"], required: true, unique: true },
    roles: {
      admin: levels,
      moderator: levels,
    },
    history: {
      type: [
        new Schema(
          {
            at: { type: Date, required: true },
            by: { type: Schema.Types.ObjectId, ref: "User" },
            changes: { type: [String], default: [] },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const RolePermission = mongoose.model<IRolePermission>("RolePermission", rolePermissionSchema);
