import { Router, Request, Response } from 'express';
import User from '../models/User';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();
router.use(authenticateJWT);

// GET /api/balance?userId=...
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (typeof userId !== 'string') {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Compute or retrieve the balance as needed. Here, returning 0 as a placeholder.
    res.status(200).json({ balance: 0 });
  } catch (error) {
    res.status(500).json({ error });
  }
});

export default router;
