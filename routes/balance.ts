import { Router, Request, Response } from 'express';
import User from '../models/User';
import { authenticateJWT } from '../middlewares/authMiddleware';
import Buyer from '../models/Buyer';

const router = Router();
router.use(authenticateJWT);


// GET /api/balance
router.get('/', async (req: Request, res: Response) => {
  try {
    const buyer = await Buyer.findOne({ user_id: req?.user?.id })
      .select('email firstName lastName phone currentBalance');

    if (!buyer) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(buyer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch buyer balance', details: error });
  }
});



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
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// POST /api/balance/update
router.post('/update', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id
    const { amount, method } = req.body;

    if (!userId || typeof amount !== 'number' || !['Cash', 'Crypto', 'EFT'].includes(method)) {
      return res.status(400).json({ message: 'Invalid request payload' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (method === 'Cash') {
      console.log("cash_balance",(Number(user.cash_balance) || 0) + Number(amount))
      user.cash_balance = Number(Number(user.cash_balance) || 0) + Number(amount);
    } else {
      const currentOther = user.other_balance || {};
      currentOther[method] = (Number(currentOther[method]) || 0) + Number(amount);
      user.other_balance = currentOther;
    }

    await user.save();

    res.status(200).json({
      message: `Updated ${method} balance successfully`,
      cash_balance: user.cash_balance,
      other_balance: user.other_balance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});


export default router;
