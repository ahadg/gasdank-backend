import { Router, Request, Response } from 'express';
import { authenticateJWT } from "../middlewares/authMiddleware";
import checkAccess from "../middlewares/accessMiddleware";
import Notification from "../models/notification";
import Sample from '../models/Sample';
import Inventory from '../models/Inventory';
import mongoose from 'mongoose';
import User from '../models/User';


const router = Router();

// Optionally protect all /api/users endpoints
router.use(authenticateJWT);

// GET /api/samples?user_id=xxx — Get all samples for a user
router.get('/', async (req: Request, res: Response) => {
  const { user_id,status } = req.query;

  if (!user_id || !mongoose.Types.ObjectId.isValid(user_id as string)) {
    return res.status(400).json({ error: 'Invalid or missing user_id' });
  }

  try {
    let samples
    if(status == "history") {
      samples = await Sample.find({ user_id }).populate("buyer_id");
    } else {
      samples = await Sample.find({ user_id, status : "holding" }).populate("buyer_id");
    }
   
    res.status(200).json(samples);
  } catch (err: any) {
    console.error('Error fetching samples:', err);
    res.status(500).json({ error: 'Failed to fetch samples', details: err.message });
  }
});


router.post('/', async (req: Request, res: Response) => {
  try {
    const { user_id, buyer_id, status = 'holding', products } = req.body;

    if (!mongoose.Types.ObjectId.isValid(user_id) || !mongoose.Types.ObjectId.isValid(buyer_id)) {
      return res.status(400).json({ error: 'Invalid user_id or buyer_id' });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products must be a non-empty array' });
    }

    for (const product of products) {
      if (
        !product.name ||
        !product.category_id ||
        !mongoose.Types.ObjectId.isValid(product.category_id) ||
        typeof product.qty !== 'number' ||
        typeof product.unit !== 'string' ||
        typeof product.measurement !== 'number' ||
        typeof product.price !== 'number' ||
        typeof product.shippingCost !== 'number'
      ) {
        return res.status(400).json({ error: 'Invalid product details' });
      }
    }

    const newSample = new Sample({
      user_id,
      buyer_id,
      status,
      products
    });

    await newSample.save();
    res.status(201).json(newSample);
  } catch (err: any) {
    console.error('Error creating sample:', err);
    res.status(500).json({ error: 'Failed to add sample', details: err.message });
  }
});


router.post('/:id/accept', async (req, res) => {
  const sample = await Sample.findById(req.params.id);
  const user = await User.findById(sample?.user_id);
  if (!sample) return res.status(404).json({ error: 'Sample not found' });

  for (const product of sample.products) {
    await Inventory.create({
      name: product.name,
      qty: product.qty,
      unit: product.unit,
      user_id: sample.user_id,
      user_created_by_id: user?.created_by,
      buyer_id: sample.buyer_id,
      category: product.category_id,
      price: product.price,
      shippingCost: product.shippingCost
    });
  }

  sample.status = 'accepted';
  await sample.save();

  res.status(200).json({ message: 'Accepted' });
});

// POST /api/samples/:id/return
router.post('/:id/return', async (req, res) => {
  const sample = await Sample.findById(req.params.id)
  if (!sample) return res.status(404).json({ error: 'Sample not found' })

  // Trigger SMS (Twilio or other)
  // sendSMS(sample.sender_phone, `Hi! Your sample "${sample.name}" was returned.`)

  sample.status = 'returned'
  await sample.save()

  res.status(200).json({ message: 'Returned' })
})
  

  export default router;