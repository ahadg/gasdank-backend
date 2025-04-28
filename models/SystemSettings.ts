import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemSettings extends Document {
  platformName?: string;
  maintenanceMode?: boolean;
  defaultUserLimits?: object;
  platformFeePercent?: number;

  plans: {
    name: 'basic' | 'pro' | 'enterprise';
    price: number;
    stripePriceId: string;
    features?: string[];
    limits?: object;
  }[];

  supportEmail?: string;
  stripePublicKey?: string;
  stripeSecretKey?: string;

  created_at: Date;
  updated_at: Date;
}

const SystemSettingsSchema = new Schema({
  platformName: { type: String, default: 'MyApp' },
  maintenanceMode: { type: Boolean, default: false },
  defaultUserLimits: { type: Object, default: {} },
  platformFeePercent: { type: Number, default: 5 },

  plans: [
    {
      name: {
        type: String,
        required: true,
      },
      price: { type: Number, required: true },
      stripePriceId: { type: String, required: true },
      features: [{ type: String }],
      limits: { type: Object, default: {} },
    },
  ],

  supportEmail: { type: String },
  stripePublicKey: { type: String },
  stripeSecretKey: { type: String },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Auto-update `updated_at`
SystemSettingsSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

export default mongoose.models.SystemSettings ||
  mongoose.model<ISystemSettings>('SystemSettings', SystemSettingsSchema);
