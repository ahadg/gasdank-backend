import express from 'express';
import PersonalSettings from '../models/PersonalSettings';
import { authenticateJWT, AuthRequest } from '../middlewares/authMiddleware';

const router = express.Router();

// Get current user's personal settings (authentication required)
router.get('/', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    console.log("PersonalSettings_called")
    const settings = await PersonalSettings.findOne({ user_id: req.user.id });
    if (!settings) {
      // Create default settings if none exist
      const defaultSettings = await PersonalSettings.create({
        user_id: req.user.id,
        units: ['pounds', 'kg', 'gram', 'per piece']
      });
      return res.json(defaultSettings);
    }
    res.json(settings);
  } catch (err) {
    console.log("err",err)
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or Update personal settings (authentication required)
router.post('/', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const existing = await PersonalSettings.findOne({ user_id: req.user.id });
    
    if (existing) {
      Object.assign(existing, req.body);
      await existing.save();
      return res.json({ message: 'Settings updated', settings: existing });
    } else {
      const created = await PersonalSettings.create({
        ...req.body,
        user_id: req.user.id
      });
      return res.status(201).json({ message: 'Settings created', settings: created });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update specific units (authentication required)
router.patch('/units', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const { units } = req.body;
    
    if (!Array.isArray(units)) {
      return res.status(400).json({ error: 'Units must be an array' });
    }
    
    const settings = await PersonalSettings.findOneAndUpdate(
      { user_id: req.user.id },
      { units },
      { new: true, upsert: true }
    );
    
    res.json({ message: 'Units updated', settings });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete personal settings (authentication required)
router.delete('/', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    await PersonalSettings.findOneAndDelete({ user_id: req.user.id });
    res.json({ message: 'Settings deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;