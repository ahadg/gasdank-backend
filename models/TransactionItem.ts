import mongoose, { Document, Schema } from 'mongoose';

export interface ITransactionItem extends Document {
  transaction_id: mongoose.Types.ObjectId;
  inventory_id: mongoose.Types.ObjectId;
  buyer_id : mongoose.Types.ObjectId;
  user_id :  mongoose.Types.ObjectId;
  qty: number;
  unit: string;
  measurement : number;
  price: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

const TransactionItemSchema: Schema = new Schema({
  transaction_id: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
  inventory_id: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
  qty: { type: Number, required: true },
  unit: { type: String, required: true },
  measurement : { type: String, required: true },
  price: { type: Number, required: true },
  sale_price : {type : Number,},
  profit : {type : Number, },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null }
});

export default mongoose.models.TransactionItem || mongoose.model<ITransactionItem>('TransactionItem', TransactionItemSchema);
