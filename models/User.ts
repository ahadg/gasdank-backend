import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  firstName: string;
  lastName: string;
//   PIN: string;
  password: string;
  email: string;
  phone?: string;
  inventory_value: number;
  balance : number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

const UserSchema: Schema = new Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
//   PIN: { type: String, required: true },
  password: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  inventory_value: {type : Number},
  balance : {type : Number},
  role : {type : String, default : "user"},
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null }
});

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
