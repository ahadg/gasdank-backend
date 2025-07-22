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
  worker_id: mongoose.Types.ObjectId;
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
  sale_reference_id?: string;
  items: ITransactionItem[];
  edited?: boolean;
  prevValues?: IPrevValue[];
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

// Define the schema for items within prevValues
const PrevValueItemSchema = new Schema({
  transactionitem_id: { type: Schema.Types.ObjectId, ref: 'TransactionItem' },
  inventory_id: { type: Schema.Types.ObjectId, ref: 'Inventory' },
  qty: Number,
  measurement: Number,
  sale_price: Number,
  price: Number,
  shipping: Number,
  unit: String,
  name: String
}, { _id: false });

// Define the schema for each edit entry in prevValues
const PrevValueSchema = new Schema({
  updated_at: { type: Date, default: Date.now },
  original_items: [PrevValueItemSchema],
  items: [PrevValueItemSchema]
}, { _id: false });

// Transaction Schema
const TransactionSchema: Schema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
  sale_id: { type: Schema.Types.ObjectId, ref: 'Transaction' },
  worker_id: { type: Schema.Types.ObjectId, ref: 'User' },
  transactionpayment_id: { type: Schema.Types.ObjectId, ref: 'TransactionPayment' },
  sample_id: { type: Schema.Types.ObjectId, ref: 'Sample' },
  payment_direction: { type: String },
  payment_method: { type: String },
  type: { type: String, default: 'sale' },
  sale_reference_id: { type: String, unique: true, sparse: true },
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
  prevValues: [PrevValueSchema]
});

// Helper function to generate a human-friendly unique alphanumeric ID
function generateReadableID(length: number = 8): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing letters/numbers like 0, O, I, 1
  return Array.from({ length }, () =>
    charset.charAt(Math.floor(Math.random() * charset.length))
  ).join('');
}

// Pre-save hook to generate unique ID if needed
TransactionSchema.pre<ITransaction>('save', async function (next) {
  if (this.type === 'sale' && !this.sale_reference_id) {
    let isUnique = false;
    let generatedID = '';

    while (!isUnique) {
      generatedID = generateReadableID();
      const existing = await mongoose.models.Transaction.findOne({ sale_reference_id: generatedID });
      if (!existing) isUnique = true;
    }

    this.sale_reference_id = generatedID;
  }

  next();
});

export default mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);
