import { Router, Request, Response } from 'express';
import User from '../models/User';
import redisClient from '../utils/redisClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();
//router.use(authenticateJWT);

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { identifier, pin } = req.body;
  console.log({ identifier, pin });

  if (!identifier || !pin) {
    return res.status(400).json({ message: 'Identifier and PIN are required' });
  }

  try {
    const normalizedIdentifier = identifier.toLowerCase();

    // Case-insensitive search for email or userName
    const user = await User.findOne({
      $or: [
        { $expr: { $eq: [{ $toLower: '$email' }, normalizedIdentifier] } },
        { $expr: { $eq: [{ $toLower: '$userName' }, normalizedIdentifier] } }
      ]
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(pin, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, access: user.access },
      process.env.JWT_SECRET as string,
      { expiresIn: '297d' }
    );

    res.status(200).json({ message: 'Login successful', token, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});

export default router;
