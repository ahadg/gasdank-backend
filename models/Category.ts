import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
    user_id: mongoose.Types.ObjectId;
  name: string;
  active?: boolean;
//   collation?: string;
//   attributes?: any;
  created_at: Date;
  updated_at: Date;
}

const CategorySchema: Schema = new Schema({
  name: { type: String, required: true },
//   type: { type: String },
//   collation: { type: String },
  active : {type : Boolean, default : true},
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
//   attributes: { type: Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

export default mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema);
