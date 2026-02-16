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
        units: ['pounds', 'kg', 'gram', 'per piece'],
        default_unit: 'pounds'
      });
      return res.json(defaultSettings);
    }
    res.json(settings);
  } catch (err) {
    console.log("err", err)
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or Update personal settings (authentication required)
router.post('/',
  authenticateJWT,
  async (req: AuthRequest, res) => {
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

// Update default unit (authentication required)
router.patch('/default-unit', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const { default_unit } = req.body;

    if (!default_unit || typeof default_unit !== 'string') {
      return res.status(400).json({ error: 'Default unit must be a valid string' });
    }

    const settings = await PersonalSettings.findOne({ user_id: req.user.id });

    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    // Check if the default_unit exists in the units array
    if (!settings.units.includes(default_unit)) {
      return res.status(400).json({ error: 'Default unit must be one of the existing units' });
    }

    settings.default_unit = default_unit;
    await settings.save();

    res.json({ message: 'Default unit updated', settings });
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