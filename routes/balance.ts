import { Router, Request, Response } from 'express';
import User from '../models/User';
import { authenticateJWT } from '../middlewares/authMiddleware';
import Buyer from '../models/Buyer';

const router = Router();
router.use(authenticateJWT);


// GET /api/balance
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (userId && typeof userId === 'string') {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      return res.status(200).json(user);
    }

    const userIdToUse = req?.user?.id;
    const buyer = await Buyer.findOne({ user_id: userIdToUse })
      .select('email firstName lastName phone currentBalance');

    if (!buyer) {
      // If no buyer found, maybe it's a User looking for their own balance?
      const user = await User.findById(userIdToUse);
      if (user) {
        return res.status(200).json(user);
      }
      return res.status(404).json({ message: 'User/Buyer not found' });
    }

    res.status(200).json(buyer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch balance', details: error });
  }
});


// GET /api/balance/owner/:userId
router.get('/owner/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    const balanceOwner = await User.getBalanceOwner(userId);
    if (!balanceOwner) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      cash_balance: balanceOwner.cash_balance,
      other_balance: balanceOwner.other_balance,
      role: balanceOwner.role,
      owner_id: balanceOwner._id
    });
  } catch (error) {
    res.status(500).json({ error });
  }
});



// POST /api/balance/update
router.post('/update', async (req: Request, res: Response) => {
  try {
    const { amount, method, user_id } = req.body;
    const userIdToProcess = user_id || req.user?.id;

    if (!userIdToProcess || typeof amount !== 'number' || !['Cash', 'Crypto', 'EFT'].includes(method)) {
      return res.status(400).json({ message: 'Invalid request payload' });
    }

    const balanceOwner: any = await User.getBalanceOwner(userIdToProcess);
    if (!balanceOwner) return res.status(404).json({ message: 'Balance owner not found' });

    if (method === 'Cash') {
      console.log("cash_balance update:", (Number(balanceOwner.cash_balance) || 0) + Number(amount))
      balanceOwner.cash_balance = (Number(balanceOwner.cash_balance) || 0) + Number(amount);
    } else {
      const currentOther = { ...(balanceOwner.other_balance || {}) };
      currentOther[method] = (Number(currentOther[method]) || 0) + Number(amount);
      balanceOwner.other_balance = currentOther;
      balanceOwner.markModified('other_balance');
    }

    await balanceOwner.save();

    res.status(200).json({
      message: `Updated ${method} balance successfully`,
      cash_balance: balanceOwner.cash_balance,
      other_balance: balanceOwner.other_balance
    });
  } catch (error) {
    console.error('Update balance error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});


export default router;
