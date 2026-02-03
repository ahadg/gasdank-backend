import mongoose, { Document, Schema } from 'mongoose';
import Category from './Category';

export interface IInventory extends Document {
  product_id: string;
  reference_number: string;
  user_id: mongoose.Types.ObjectId;
  user_created_by_id: mongoose.Types.ObjectId;
  buyer_id: mongoose.Types.ObjectId;
  category: mongoose.Types.ObjectId;
  qty: number;
  unit: string;
  name: string;
  price: number;
  shippingCost?: number;
  active?: boolean;
  notes?: string;
  product_type?: mongoose.Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

// Function to generate product ID with format MANA-YYMMDDHHMM
export const generateProductId = () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(2);
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const randomDigits = Math.floor(100 + Math.random() * 900); // 3-digit random number

  return `MANA-${year}${day}${hour}${randomDigits}`;
};

// Function to get next reference number
const getNextReferenceNumber = async (): Promise<number> => {
  try {
    const lastProduct = await mongoose.models.Inventory
      .findOne({})
      .sort({ created_at: -1 }) // 🔥 latest created
      .select('reference_number created_at');

    const lastRef = lastProduct?.reference_number;
    console.log("lastRef", lastRef)

    return typeof lastRef === 'number' ? lastRef + 1 : Number(lastRef) + 1;
  } catch (error) {
    console.error('Error getting next reference number:', error);

    const count = await mongoose.models.Inventory.countDocuments({});
    return count + 1;
  }
};



const InventorySchema: Schema = new Schema({
  product_id: {
    type: String,
    unique: true,
    default: generateProductId
  },
  reference_number: {
    type: String,
    //unique: true,
    //required: true
  },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_created_by_id: { type: Schema.Types.ObjectId, ref: 'User' },
  buyer_id: { type: Schema.Types.ObjectId, ref: 'Buyer', },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  //info: { type: String, required: true },
  qty: { type: Number, required: true },
  unit: { type: String, required: true },
  name: { type: String },
  price: { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  notes: { type: String },
  product_type: { type: Schema.Types.ObjectId, ref: 'ProductType' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Pre-save hook to set product_id and reference_number
InventorySchema.pre('save', async function (next) {
  try {
    if (this.isNew) {
      if (!this.product_id) {
        this.product_id = generateProductId();
      }
      console.log("this.reference_number", this.reference_number)
      if (!this.reference_number) {
        //console.log("this.reference_number_inside",await getNextReferenceNumber()) 
        const reference_number = await getNextReferenceNumber()
        console.log("reference_numberrr", reference_number)
        this.reference_number = reference_number

      }
      if (!this.name) {
        this.name = `#${this.reference_number || ""}`

      }
      console.log("this.name", this.name)
    }

    this.updated_at = new Date();

    next();
  } catch (error: any) {
    next(error);
  }
});

InventorySchema.index({ reference_number: 1 });

export default mongoose.models.Inventory || mongoose.model<IInventory>('Inventory', InventorySchema);