import mongoose, { Document, Schema } from 'mongoose';

export interface IBuyer extends Document {
  user_id: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status?: string;
  //   balance?: number;
  currentBalance?: number;
  startingBalance?: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

const BuyerSchema: Schema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  firstName: { type: String, required: true },
  admin_id: { type: Schema.Types.ObjectId, ref: 'User' },
  created_by_role: { type: String, enum: ['user', 'admin'], default: "admin" },
  lastName: {
    type: String,
    //  required: true 
  },
  email: {
    type: String,
    // required: true 
  },
  phone: { type: String },
  status: { type: Boolean, default: true },
  //   balance: { type: Number, default: 0 },
  currentBalance: { type: Number, default: 0 },
  startingBalance: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null }
});

export default mongoose.models.Buyer || mongoose.model<IBuyer>('Buyer', BuyerSchema);
