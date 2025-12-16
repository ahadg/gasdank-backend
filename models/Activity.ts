import mongoose, { Document, Schema } from 'mongoose';

export interface IActivity extends Document {
  user_id: mongoose.Types.ObjectId;
  user_created_by: mongoose.Types.ObjectId;
  page: string;
  type: string;
  amount: number;
  payment_method: string;
  payment_direction: string;
  created_at: Date;
  updated_at: Date;
}

const ActivitySchema: Schema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  transaction_id: { type: Schema.Types.ObjectId, ref: 'Transaction' },
  worker_id: { type: Schema.Types.ObjectId, ref: 'User' },
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer' },

  action: { type: String, required: true },
  resource_type: { type: String },
  resource_id: { type: Schema.Types.ObjectId },

  page: { type: String },
  type: { type: String },

  description: { type: String },
  ip_address: { type: String },
  user_agent: { type: String },

  location: { type: String },

  amount: { type: String },
  payment_method: { type: String },
  payment_direction: { type: String },

  status: { type: String, default: 'success' },

  metadata: { type: Object },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

export default mongoose.models.Activity || mongoose.model<IActivity>('Activity', ActivitySchema);
