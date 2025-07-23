import mongoose, { Document, Schema } from 'mongoose';

export interface IPersonalSettings extends Document {
  user_id: mongoose.Types.ObjectId;
  units: string[];
  default_unit: string;
  created_at: Date;
  updated_at: Date;
}

const PersonalSettingsSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  units: {
    type: [String],
    default: ['pounds', 'kg', 'gram', 'per piece']
  },
  default_unit: {
    type: String,
    default: 'pounds'
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

PersonalSettingsSchema.pre('save', function (next) {
  this.updated_at = new Date();
  
  // Ensure default_unit is always in the units array
  if (this.default_unit && !this.units.includes(this.default_unit)) {
    this.units.push(this.default_unit);
  }
  
  // If default_unit is not set or not in units array, set it to the first unit
  if (!this.default_unit || !this.units.includes(this.default_unit)) {
    this.default_unit = this.units[0] || 'pounds';
  }
  
  next();
});

export default mongoose.models.PersonalSettings || mongoose.model<IPersonalSettings>('PersonalSettings', PersonalSettingsSchema);