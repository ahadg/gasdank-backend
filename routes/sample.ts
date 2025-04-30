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
  const { user_id } = req.query;

  if (!user_id || !mongoose.Types.ObjectId.isValid(user_id as string)) {
    return res.status(400).json({ error: 'Invalid or missing user_id' });
  }

  try {
    const samples = await Sample.find({ user_id, status : "holding" });
    res.status(200).json(samples);
  } catch (err: any) {
    console.error('Error fetching samples:', err);
    res.status(500).json({ error: 'Failed to fetch samples', details: err.message });
  }
});


// POST /api/sample — Add a new sample
router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        name,
        user_id,
        category_id,
        qty,
        unit,
        measurement,
        status = 'holding',
        buyer_id,
        price,
        shippingCost
      } = req.body
  
      if (!mongoose.Types.ObjectId.isValid(user_id) || !mongoose.Types.ObjectId.isValid(buyer_id) || !mongoose.Types.ObjectId.isValid(category_id)) {
        return res.status(400).json({ error: 'Invalid user_id or category_id' })
      }
  
      const newSample = new Sample({
        name,
        user_id,
        category_id,
        buyer_id,
        qty,
        unit,
        measurement,
        status,
        price,
        shippingCost
      })
  
      await newSample.save()
      res.status(201).json(newSample)
    } catch (err: any) {
      console.error('Error creating sample:', err)
      res.status(500).json({ error: 'Failed to add sample', details: err.message })
    }
  })

// POST /api/sample/:id/accept
router.post('/:id/accept', async (req, res) => {
    const sample = await Sample.findById(req.params.id)
    const user = await User.findById(sample?.user_id)
    if (!sample) return res.status(404).json({ error: 'Sample not found' })
  
    // Create Inventory record (optional)
    await Inventory.create({
      name: sample.name,
      qty: sample.qty,
      unit: sample.unit,
      user_id: sample.user_id,
      user_created_by_id: user?.created_by,
      buyer_id : sample.buyer_id,
      
      category: sample.category_id,
      price: sample?.price,
      shippingCost : sample.shippingCost
    })
  
    sample.status = 'accepted'
    await sample.save()
  
    res.status(200).json({ message: 'Accepted' })
  })
  
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