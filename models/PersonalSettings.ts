import mongoose, { Document, Schema } from 'mongoose';

export interface IPersonalSettings extends Document {
  user_id: mongoose.Types.ObjectId;  
  units: string[];
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
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});


PersonalSettingsSchema.pre('save', function (next) {
    this.updated_at = new Date();
    next();
  });
  
export default mongoose.models.PersonalSettings ||
mongoose.model<IPersonalSettings>('PersonalSettings', PersonalSettingsSchema);
