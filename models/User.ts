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
  manual_balance : number;
  other_munual_balance : Object;
  created_by : mongoose.Types.ObjectId;
  other_balance: object;
  cash_balance : object;
  access : object;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  plan?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialEnd?: Date;
  paymentMethodType?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: string;
}

const UserSchema: Schema = new Schema({
  created_by:  { type: Schema.Types.ObjectId, ref: 'User' },
  firstName: { type: String, required: true },
  lastName: { type: String},
  userName : {type : String, required : true},
//   PIN: { type: String, required: true },
  password: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  inventory_value: {type : Number},
  //manual_balance : {type : Number},
  other_balance: {type : Object,default : {}},
  //other_munual_balance: {type : Object,default : {}},
  cash_balance : {type : Number},
  access : {type : Object},
  role : {type : String, default : "user"},
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  subscriptionStatus: { 
    type: String,
  },
  plan: {
    type: String,
  },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  trialEnd: { type: Date },
  paymentMethodType: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
