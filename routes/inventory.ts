import { Router, Request, Response } from 'express';
import Inventory from '../models/Inventory';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';
import User from '../models/User';

const router = Router();
router.use(authenticateJWT);

// GET /api/inventory/outOfStock
router.get('/outOfStock',checkAccess("reports","read"), async (req: Request, res: Response) => {
  try {
    const outOfStock = await Inventory.find({ qty: 0 }).populate("category");
    res.status(200).json(outOfStock);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET /api/inventory/lowInventory
router.get('/lowInventory', checkAccess("reports","read"),async (req: Request, res: Response) => {
  try {
    const lowInventory = await Inventory.find({ qty: { $gt: -1, $lt: 5 } }).populate("category");
    res.status(200).json(lowInventory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET /api/inventory/:userid
router.get('/:userid',checkAccess("inventory","read"), async (req: Request, res: Response) => {
  try {
    const { userid } = req.params;
    const { category, page, limit } = req.query;
    
    // Convert page and limit to numbers (default values: page 1, limit 10)
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Build the query: always filter by user_id, add category filter if provided.
    const query: any = { user_id: userid };
    if (category) {
      query.info = { $regex: category, $options: 'i' };
    }

    // Get total number of matching documents (for pagination metadata)
    const totalProducts = await Inventory.countDocuments(query);
    // Fetch paginated results
    const products = await Inventory.find(query).skip(skip).limit(limitNum).populate("category");

    res.status(200).json({
      page: pageNum,
      limit: limitNum,
      totalProducts,
      products
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/:userid/:buyerid
router.get('/:userid/inventory/:buyerid',checkAccess("inventory","read"), async (req: Request, res: Response) => {
  try {
    const { userid,buyerid } = req.params;
    const { category, page, limit } = req.query;
    
    // Convert page and limit to numbers (default values: page 1, limit 10)
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Build the query: always filter by user_id, add category filter if provided.
    const query: any = { user_id: userid,
      // buyer_id : buyerid 
      };
    if (category) {
      query.category =  category;
    }

    // Get total number of matching documents (for pagination metadata)
    const totalProducts = await Inventory.countDocuments(query);
    // Fetch paginated results
    const products = await Inventory.find(query).skip(skip).limit(limitNum).populate("category");

    res.status(200).json({
      page: pageNum,
      limit: limitNum,
      totalProducts,
      products
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/product/:id - Update a buyer by ID
router.get('/product/:id',checkAccess("inventory","read"), async (req: Request, res: Response) => {
    try {

      console.log("id",req.params)
      const { id } = req.params;
      const updatedProduct = await Inventory.findById(id).populate("category");
      if (!updatedProduct) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.status(200).json(updatedProduct);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

// PUT /api/inventory/:id - Update a Product by ID
router.put('/:id', checkAccess("inventory","edit"),async (req: Request, res: Response) => {
    try {
      const updatedProduct = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updatedProduct) {
        return res.status(404).json({ message: 'Buyer not found' });
      }
      res.status(200).json(updatedProduct);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

// POST /api/inventory
router.post('/',checkAccess("inventory","create"), async (req: Request, res: Response) => {
  try {
    const the_user = await User.findById(req.user?.id)
    const newProduct = new Inventory({...req.body,user_created_by_id: the_user?.created_by});
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    console.log("error",error)
    res.status(500).json({ error });
  }
});

// DELETE /api/inventory (soft delete)
router.delete('/',checkAccess("inventory","delete"), async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    await Inventory.findByIdAndUpdate(id, { deleted_at: new Date() });
    res.status(200).json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error });
  }
});

export default router;
