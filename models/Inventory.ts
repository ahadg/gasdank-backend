import mongoose, { Document, Schema } from 'mongoose';
import Category from './Category';

export interface IInventory extends Document {
  user_id: mongoose.Types.ObjectId;
  buyer_id: mongoose.Types.ObjectId;
//   info: string;
  qty: number;
  unit: string;
  name: string;
  price: number;
  shippingCost?: number;
  status?: boolean;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

const InventorySchema: Schema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
//   info: { type: String, required: true },
  qty: { type: Number, required: true },
  unit: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  category : { type: String, },
  active: { type: Boolean, default : true },
  notes: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

export default mongoose.models.Inventory || mongoose.model<IInventory>('Inventory', InventorySchema);
