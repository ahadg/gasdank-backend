import mongoose, { Document, Schema } from 'mongoose';

export interface ITransactionPayment extends Document {
  transaction_id: mongoose.Types.ObjectId;
  buyer_id: mongoose.Types.ObjectId;
  amount_paid: number;
  payment_direction : string;
  payment_method: string;
  payment_date: Date;
  created_at: Date;
  updated_at: Date;
}

const TransactionPaymentSchema: Schema = new Schema({
  transaction_id : { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
  buyer_id : { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
  admin_id: { type: Schema.Types.ObjectId, ref: 'User' }, // optional, only if created by an admin
  created_by_role: { type: String, enum: ['user', 'admin'], default : 'admin' }, // helps in filtering
  user_id: { type: Schema.Types.ObjectId, ref: 'User'},
  amount_paid: { type: Number, required: true },
  payment_method: { type: String, required: true },
  payment_direction : {type : String, required : true},
  payment_date: { type: Date, required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

export default mongoose.models.TransactionPayment || mongoose.model<ITransactionPayment>('TransactionPayment', TransactionPaymentSchema);
