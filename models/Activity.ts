import mongoose, { Document, Schema } from 'mongoose';

export interface IActivity extends Document {
  user_id: mongoose.Types.ObjectId;
  user_created_by: mongoose.Types.ObjectId;
  page: string;
  type : string;
  amount : number;
  payment_method : string;
  payment_direction : string;
  created_at: Date;
  updated_at: Date;
}

const ActivitySchema: Schema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  transaction_id:  { type: Schema.Types.ObjectId, ref: 'Transaction' },
  worker_id : { type: Schema.Types.ObjectId, ref: 'User' },
  buyer_id:  { type: Schema.Types.ObjectId, ref: 'Buyer' },

  action: { type: String, required: true }, // e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
  resource_type: { type: String }, // e.g., 'Post', 'Comment', 'Invoice'
  resource_id: { type: Schema.Types.ObjectId }, // optional: points to specific resource if applicable

  page: { type: String }, // frontend route or page name
  type: { type: String }, // custom classification if needed

  description: { type: String }, // brief summary of the activity
  ip_address: { type: String }, // client IP address
  user_agent: { type: String }, // browser/device info

  location: { type: String }, // optional: geo-location (city/country)

  amount: { type: String }, // used for financial activity
  payment_method: { type: String }, // e.g., 'credit_card', 'paypal'
  payment_direction : {type : String},

  status: { type: String, default: 'success' }, // success, failed, pending, etc.

  metadata: { type: Object }, // flexible field for extra context (e.g., before/after changes)

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

export default mongoose.models.Activity || mongoose.model<IActivity>('Activity', ActivitySchema);
