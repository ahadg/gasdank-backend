import { Router, Request, Response } from 'express';
import Inventory from '../models/Inventory';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';

const router = Router();
router.use(authenticateJWT);


// GET /api/products/:userid
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

// GET /api/products/:userid/:buyerid
router.get('/:userid/products/:buyerid',checkAccess("inventory","read"), async (req: Request, res: Response) => {
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

// GET /api/products/product/:id - Update a buyer by ID
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

// PUT /api/products/:id - Update a Product by ID
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

// POST /api/products
router.post('/',checkAccess("inventory","create"), async (req: Request, res: Response) => {
  try {
    console.log("req.body",req.body)
    const newProduct = new Inventory(req.body);
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// DELETE /api/products (soft delete)
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
