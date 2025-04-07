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
  const { identifier, pin } = req.body; // `email` can be username or email
  console.log({ identifier, pin });

  try {
    // Find user by identifier or username
    const user = await User.findOne({
      $or: [{ email: identifier }, { userName: identifier }],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Compare submitted password with the stored hashed password
    const isMatch = await bcrypt.compare(pin, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, access: user?.access },
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
