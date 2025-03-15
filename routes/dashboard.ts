import { Router, Request, Response } from 'express';
import Transaction from '../models/Transaction';
import Inventory from '../models/Inventory';

const router = Router();

// GET /api/dashboard
router.get('/', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysTransactions = await Transaction.find({ created_at: { $gte: today } });
    const sales = todaysTransactions.reduce((sum, tx) => sum + tx.total, 0);
    const profits = todaysTransactions.reduce((sum, tx) => sum + (tx.total - tx.amount_paid), 0);
    const inventories = await Inventory.find();
    const inventoryValue = inventories.reduce((sum, item) => sum + item.price * item.qty, 0);
    
    res.status(200).json({
      sales,
      profits,
      inventoryValue
    });
  } catch (error) {
    res.status(500).json({ error });
  }
});

export default router;
