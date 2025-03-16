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
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Compare the submitted password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate a JWT token (expires in 1 hour)
    const token = jwt.sign(
      { id: user._id, email: user.email, access: user?.access },
      process.env.JWT_SECRET as string,
      { expiresIn: '297d' }
    );
    
    // Optionally cache session data in Redis
    //await redisClient.set(`session:${user._id}`, JSON.stringify({ id: user._id, email: user.email }), 'EX', 3600);
    
    res.status(200).json({ message: 'Login successful', token, user });
  } catch (error) {
    console.log('error',error)
    res.status(500).json({ message: 'Server error', error });
  }
});

export default router;
