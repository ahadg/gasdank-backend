import mongoose, { Document, Schema } from 'mongoose';

export interface ITransactionItem {
  inventoryID: mongoose.Types.ObjectId;
  qty: number;
  unit: string;
  price: number;
  sale_price: number;
  payment_direction: string;
  shipping: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface IPrevValueItem {
  transactionitem_id: mongoose.Types.ObjectId;
  inventory_id: mongoose.Types.ObjectId;
  qty: number;
  measurement: number;
  sale_price: number;
  price: number;
  shipping: number;
  unit: string;
  name: string;
}

export interface IPrevValue {
  updated_at: Date;
  original_items: IPrevValueItem[];
  items: IPrevValueItem[];
}

export interface ITransaction extends Document {
  user_id: mongoose.Types.ObjectId;
  buyer_id: mongoose.Types.ObjectId;
  payment: number;
  status: number;
  datePaid?: Date;
  notes?: string;
  item_count: number;
  total: number;
  amount_paid: number;
  total_shipping: number;
  payment_direction: string;
  payment_method: string;
  type?: string;
  profit: number;
  sale_price: number;
  items: ITransactionItem[];
  edited?: boolean;
  prevValues?: IPrevValue[];
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

// Define the schema for items within prevValues
const PrevValueItemSchema = new Schema({
  transactionitem_id: { 
    type: Schema.Types.ObjectId, 
    ref: 'TransactionItem'
  },
  inventory_id: { 
    type: Schema.Types.ObjectId, 
    ref: 'Inventory'
  },
  qty: { type: Number },
  measurement: { type: Number },
  sale_price: { type: Number },
  price: { type: Number },
  shipping: { type: Number },
  unit: { type: String },
  name: { type: String }
}, { _id: false }); // _id: false to prevent auto-generation of _id for subdocuments

// Define the schema for each edit entry in prevValues
const PrevValueSchema = new Schema({
  updated_at: { type: Date, default: Date.now },
  original_items: [PrevValueItemSchema],
  items: [PrevValueItemSchema]
}, { _id: false });

// type = "sale/return/payment"
const TransactionSchema: Schema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
  transactionpayment_id: { type: Schema.Types.ObjectId, ref: 'TransactionPayment' },
  payment_direction: { type: String },
  payment_method: { type: String },
  type: { type: String, default: "sale" },
  notes: { type: String },
  price: { type: Number },
  sale_price: { type: Number },
  total_shipping: { type: Number },
  profit: { type: Number },
  items: [{
    transactionitem_id: { type: Schema.Types.ObjectId, ref: 'TransactionItem', required: true },
  }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  edited: { type: Boolean, default: false },
  prevValues: [PrevValueSchema] // Array of structured edit history
});

export default mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);