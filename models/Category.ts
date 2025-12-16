import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  user_id: mongoose.Types.ObjectId;
  name: string;
  active?: boolean;
  created_at: Date;
  updated_at: Date;
}

const CategorySchema: Schema = new Schema({
  name: { type: String, required: true },
  active: { type: Boolean, default: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

export default mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema);
