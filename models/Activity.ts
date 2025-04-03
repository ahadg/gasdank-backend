import mongoose, { Document, Schema } from 'mongoose';

export interface ILoginTracker extends Document {
  page: string;
  type : string;
  amount : string;
  payment_method : string;
  created_at: Date;
  updated_at: Date;
}

const LoginTrackerSchema: Schema = new Schema({
    page: { type: String},
    type: { type: String},
    amount: { type: String},
    payment_method: { type: String},
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

export default mongoose.models.LoginTracker || mongoose.model<ILoginTracker>('LoginTracker', LoginTrackerSchema);
