import { Router, Request, Response } from 'express';
import Buyer from '../models/Buyer';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';

const router = Router();
router.use(authenticateJWT);

// POST /api/buyers - Create a new buyer
router.post('/', checkAccess("wholesale", "create"), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Check if a buyer with the same email already exists
    const existingBuyer = await Buyer.findOne({ email });
    if (existingBuyer) {
      return res.status(400).json({ error: 'A buyer with this email already exists.' });
    }

    const newBuyer = new Buyer(req.body);
    await newBuyer.save();
    res.status(201).json(newBuyer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/buyers - List all buyers or filter by "user_id" id (assumed as UID)
router.get('/',checkAccess("wholesale","read"), async (req: Request, res: Response) => {
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
router.delete('/:id',checkAccess("wholesale","delete"), async (req: Request, res: Response) => {
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

// GET /api/buyers/:id - Delete a buyer by ID (optional)
router.post('/balance/:id', async (req: Request, res: Response) => {
  try {
    const body = req.body
    await Buyer.findByIdAndUpdate(req.params.id, { $inc: { currentBalance: body?.currentBalance } });
    res.status(200).json({ message: 'Buyer balance updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// // GET /api/buyers/products/:id - Delete a buyer by ID (optional)
// router.get('/:id', async (req: Request, res: Response) => {
//     try {
//       const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
//       if (!deletedBuyer) {
//         return res.status(404).json({ message: 'Buyer not found' });
//       }
//       res.status(200).json({ message: 'Buyer deleted successfully' });
//     } catch (error: any) {
//       res.status(500).json({ error: error.message });
//     }
// });

// GET /api/buyers/products/:id - Delete a buyer by ID (optional)
// router.get('/:activereciept', async (req: Request, res: Response) => {
//   try {
//     const deletedBuyer = await Buyer.findByIdAndDelete(req.params.id);
//     if (!deletedBuyer) {
//       return res.status(404).json({ message: 'Buyer not found' });
//     }
//     res.status(200).json({ message: 'Buyer deleted successfully' });
//   } catch (error: any) {
//     res.status(500).json({ error: error.message });
//   }
// });

export default router;
