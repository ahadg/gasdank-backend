import express from 'express';
import SystemSettings from '../models/SystemSettings';
import { isSuperAdmin } from '../middlewares/accessMiddleware';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = express.Router();

// Get current system settings (no authentication required)
router.get('/', async (req, res) => {
  try {
    const settings = await SystemSettings.findOne();
    if (!settings) return res.status(404).json({ message: 'Settings not found' });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or Update system settings (SuperAdmin only, authentication required)
router.post('/', authenticateJWT, isSuperAdmin, async (req, res) => {
  try {
    const existing = await SystemSettings.findOne();

    if (existing) {
      Object.assign(existing, req.body);
      await existing.save();
      return res.json({ message: 'Settings updated', settings: existing });
    } else {
      const created = await SystemSettings.create(req.body);
      return res.status(201).json({ message: 'Settings created', settings: created });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
