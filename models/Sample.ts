// models/Sample.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface ISample extends Document {
  name: string
//   sender_phone: string
  buyer_id: mongoose.Types.ObjectId
  user_id: mongoose.Types.ObjectId
  category_id: mongoose.Types.ObjectId
  qty: number
  unit: string
  measurement: number
  status: string
  created_at: Date
  price : number,
  shippingCost : number
}

const SampleSchema = new Schema({
  name: { type: String, required: true },
//   sender_phone: { type: String, required: true },
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  category_id: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  qty: { type: Number, required: true },
  unit: { type: String, required: true },
  measurement: { type: Number, required: true },
  price: { type: Number, required: true },
  shippingCost: { type: Number, required: true },
  status: { type: String, default: 'holding' },
  created_at: { type: Date, default: Date.now },
})

export default mongoose.models.Sample || mongoose.model<ISample>('Sample', SampleSchema)
