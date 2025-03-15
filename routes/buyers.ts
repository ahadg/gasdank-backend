import { Router, Request, Response } from 'express';
import Buyer from '../models/Buyer';

const router = Router();

// POST /api/buyers - Create a new buyer
router.post('/', async (req: Request, res: Response) => {
  try {
    const newBuyer = new Buyer(req.body);
    await newBuyer.save();
    res.status(201).json(newBuyer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/buyers - List all buyers or filter by "user_id" id (assumed as UID)
router.get('/', async (req: Request, res: Response) => {
  try {
    // If a query parameter "UID" is provided, filter by it.
    const { user_id } = req.query;
    let buyers;
    if (user_id) {
      buyers = await Buyer.find({ user_id });
    } else {
      buyers = await Buyer.find();
    }
    res.status(200).json(buyers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/buyers/:buyerid - Get buyers by id
router.get('/:buyerid', async (req: Request, res: Response) => {
  try {
    const buyer = await Buyer.findById(req.params.buyerid);
    if (!buyer) {
      return res.status(404).json({ message: 'Buyer not found' });
    }
    res.status(200).json(buyer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/buyers/:id - Update a buyer by ID
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updatedBuyer = await Buyer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedBuyer) {
      return res.status(404).json({ message: 'Buyer not found' });
    }
    res.status(200).json(updatedBuyer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/buyers/:id - Delete a buyer by ID (optional)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
    if (!deletedBuyer) {
      return res.status(404).json({ message: 'Buyer not found' });
    }
    res.status(200).json({ message: 'Buyer deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/buyers/transaction/:id - Delete a buyer by ID (optional)
router.get('/:id', async (req: Request, res: Response) => {
    try {
      const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
      if (!deletedBuyer) {
        return res.status(404).json({ message: 'Buyer not found' });
      }
      res.status(200).json({ message: 'Buyer deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

// GET /api/buyers/products/:id - Delete a buyer by ID (optional)
router.get('/:id', async (req: Request, res: Response) => {
    try {
      const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
      if (!deletedBuyer) {
        return res.status(404).json({ message: 'Buyer not found' });
      }
      res.status(200).json({ message: 'Buyer deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

export default router;
