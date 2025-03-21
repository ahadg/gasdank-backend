import { Router, Request, Response } from 'express';
import Inventory from '../models/Inventory';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';

const router = Router();
router.use(authenticateJWT);

// GET /api/inventory/outOfStock
router.get('/outOfStock',checkAccess("reports","read"), async (req: Request, res: Response) => {
  try {
    const outOfStock = await Inventory.find({ qty: 0 });
    res.status(200).json(outOfStock);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET /api/inventory/lowInventory
router.get('/lowInventory', checkAccess("reports","read"),async (req: Request, res: Response) => {
  try {
    const lowInventory = await Inventory.find({ qty: { $gt: -1, $lt: 5 } });
    res.status(200).json(lowInventory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

export default router;
