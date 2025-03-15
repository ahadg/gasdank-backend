import mongoose, { Document, Schema } from 'mongoose';

export interface ILoginTracker extends Document {
  pin: string;
  visit_time: Date;
  ip: string;
  created_at: Date;
  updated_at: Date;
}

const LoginTrackerSchema: Schema = new Schema({
  pin: { type: String, required: true },
  visit_time: { type: Date, default: Date.now },
  ip: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

export default mongoose.models.LoginTracker || mongoose.model<ILoginTracker>('LoginTracker', LoginTrackerSchema);
