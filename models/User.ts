import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  userName: string;
//   PIN: string;
  password: string;
  email: string;
  phone?: string;
  inventory_value: number;
  balance : number;
  created_by : mongoose.Types.ObjectId;
  other_balance: object;
  cash_balance : object;
  access : object;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

const UserSchema: Schema = new Schema({
  created_by:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  userName : {type : String, required : true},
//   PIN: { type: String, required: true },
  password: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  inventory_value: {type : Number},
  balance : {type : Number},
  other_balance: {type : Object,default : {}},
  cash_balance : {type : Number},
  access : {type : Object},
  role : {type : String, default : "user"},
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null }
});

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
