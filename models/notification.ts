import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  user_id: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  type: string;
  message: string;
  isRead: boolean;
  activityId: mongoose.Types.ObjectId;
  createdAt: Date;
  updated_at: Date;
}

const NotificationSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // recipient
  actorId: { type: Schema.Types.ObjectId, ref: 'User' }, // person who triggered it
  type: { type: String, required: true }, // e.g., 'comment_reply', 'mention', 'follow'
  message: { type: String },
  isRead: { type: Boolean, default: false },
  activityId: { type: Schema.Types.ObjectId, ref: 'Activity' },
  createdAt: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

export default mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
