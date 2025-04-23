import mongoose, { Document, Schema } from 'mongoose';

export interface IExpense extends Document {
  user_id:  mongoose.Types.ObjectId;
  user_created_by_id:  mongoose.Types.ObjectId;
  category_id : mongoose.Types.ObjectId;
  amount : Number;
  description: string;
  created_at: Date;
  updated_at: Date;
}

const ExpenseSchema: Schema = new Schema({
    user_id:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    user_created_by_id:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category_id :  { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    amount : { type: Number, required: true },
    description:  { type: String, required: true },
    created_at:  { type: Date, default: Date.now },
    updated_at:  { type: Date, default: Date.now },
});

export default mongoose.models.Expense || mongoose.model<IExpense>('Expense', ExpenseSchema);
