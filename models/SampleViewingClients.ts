import mongoose, { Schema, Document } from 'mongoose'

export interface ISampleViewingClient extends Document {
  buyer_id: mongoose.Types.ObjectId
  user_created_by: mongoose.Types.ObjectId
  user_id: mongoose.Types.ObjectId
  items: {
    productId: mongoose.Types.ObjectId
    name: string
    qty: number
    unit: string
    price: number
    status: 'pending' | 'accepted' | 'rejected'
    shippingCost : number
  }[]
  viewingStatus: 'pending' | 'viewed'
  sentAt: Date
  notes?: string
}

const SampleViewingClientSchema = new Schema({
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
  user_created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [
    {
      productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      name: { type: String, required: true },
      qty: { type: Number, required: true },
      unit: { type: String, required: true },
      price: { type: Number, required: true },
      shippingCost : {type : Number, required : true},
      status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    },
  ],
  viewingStatus: { type: String, enum: ['pending', 'viewed'], default: 'pending' },
  sentAt: { type: Date, default: Date.now },
  notes: { type: String },
})

export default mongoose.models.SampleViewingClient || mongoose.model<ISampleViewingClient>('SampleViewingClient', SampleViewingClientSchema)
