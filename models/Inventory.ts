import mongoose, { Document, Schema } from 'mongoose';
import Category from './Category';

export interface IInventory extends Document {
  product_id: string;
  user_id: mongoose.Types.ObjectId;
  user_created_by_id: mongoose.Types.ObjectId;
  buyer_id: mongoose.Types.ObjectId;
  category: mongoose.Types.ObjectId;
  //info: string;
  qty: number;
  unit: string;
  name: string;
  price: number;
  shippingCost?: number;
  active?: boolean;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// Function to generate product ID with format MANA-YYMMDDHHMM
export const generateProductId = () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4-digit random number

  return `MANA-${year}${month}${day}${hours}${minutes}${randomDigits}`;
};

const InventorySchema: Schema = new Schema({
  product_id: { 
    type: String,
    unique: true,
    default: generateProductId
  },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_created_by_id: { type: Schema.Types.ObjectId, ref: 'User' },
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  //info: { type: String, required: true },
  qty: { type: Number, required: true },
  unit: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  notes: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Pre-save hook to ensure product_id is set
InventorySchema.pre('save', function(next) {
  // Only set product_id if it's a new document
  if (this.isNew && !this.product_id) {
    this.product_id = generateProductId();
  }
  next();
});

export default mongoose.models.Inventory || mongoose.model<IInventory>('Inventory', InventorySchema);