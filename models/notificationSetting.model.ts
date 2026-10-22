import mongoose, { Schema, Document } from "mongoose";

// On/off for each automatic message (see utils/notify.ts). Missing = on.

export interface INotificationSetting extends Document {
  key: string;
  enabled: boolean;
  updatedBy?: mongoose.Types.ObjectId;
}

const notificationSettingSchema = new Schema<INotificationSetting>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const NotificationSetting = mongoose.model<INotificationSetting>("NotificationSetting", notificationSettingSchema);
