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

// POST /api/balance/update
router.post('/update', async (req: Request, res: Response) => {
  try {
    const { userId, amount, method } = req.body;

    if (!userId || typeof amount !== 'number' || !['Cash', 'Crypto', 'EFT'].includes(method)) {
      return res.status(400).json({ message: 'Invalid request payload' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (method === 'Cash') {
      user.balance = (user.balance || 0) + amount;
    } else {
      const currentOther = user.other_balance || {};
      currentOther[method] = (currentOther[method] || 0) + amount;
      user.other_balance = currentOther;
    }

    await user.save();

    res.status(200).json({
      message: `Updated ${method} balance successfully`,
      balance: user.balance,
      other_balance: user.other_balance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});


export default router;
