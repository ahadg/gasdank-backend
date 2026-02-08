import { Router, Request, Response } from 'express';
import Inventory from '../models/Inventory';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';
import User from '../models/User';
import { createActivity } from './activity';

const router = Router();
router.use(authenticateJWT);

// GET /api/inventory/next-reference-number - Get next available reference number
router.get('/next-reference-number', checkAccess("inventory", "read"), async (req: Request, res: Response) => {
  try {
    const lastProduct = await Inventory.findOne({})
      .sort({ reference_number: -1 })
      .select('reference_number');
    //***** InventorySchema.pre('save' check in inventory Model
    const lastRef = lastProduct?.reference_number;
    let nextReferenceNumber = 1;

    if (lastRef) {
      const parsedRef = parseInt(lastRef, 10);
      if (!isNaN(parsedRef)) {
        nextReferenceNumber = parsedRef + 1;
      }
    }

    res.status(200).json({ nextReferenceNumber });
  } catch (error: any) {
    console.error('Error getting next reference number:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/outOfStock
router.get('/outOfStock', checkAccess("reports", "read"), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const outOfStock = await Inventory.find({ qty: 0, user_id: userId }).populate("category");
    res.status(200).json(outOfStock);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET /api/inventory/lowInventory
router.get('/lowInventory', checkAccess("reports", "read"), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const lowInventory = await Inventory.find({ qty: { $gt: -1, $lt: 5 }, user_id: userId }).populate("category");
    res.status(200).json(lowInventory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET /api/inventory/:userid
router.get('/:userid', checkAccess("inventory", "read"), async (req: Request, res: Response) => {
  try {
    const { userid } = req.params;
    const { category, page, limit, qty, product_type } = req.query;

    // find user
    const user: any = await User.findById(userid);
    let userid_admin = user?.created_by || null;

    // pagination
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // build query
    const query: any = {
      $or: userid_admin
        ? [{ user_id: userid }, { user_id: userid_admin }]
        : [{ user_id: userid }, { user_created_by_id: userid }],
    };

    console.log("query", query)

    if (category) {
      query.category = category;
    }

    if (product_type) {
      query.product_type = product_type;
    }

    if (qty === 'gt0') {
      query.qty = { $gt: 0 };
    }

    // fetch data
    const totalProducts = await Inventory.countDocuments(query);
    const products = await Inventory.find(query)
      .skip(skip)
      .limit(limitNum)
      .populate("category")
      .populate("product_type");

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
router.get(
  '/:userid/inventory/:buyerid',
  checkAccess('inventory', 'read'),
  async (req: Request, res: Response) => {
    try {
      const { userid /*, buyerid*/ } = req.params;
      const { category, page, limit, product_type } = req.query;

      const user: any = await User.findById(userid).lean();
      const userid_admin = user?.created_by || null;

      // Pagination (defaults)
      const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 10, 1), 100);
      const skip = (pageNum - 1) * limitNum;

      // Build query
      const query: any = {
        $or: userid_admin
          ? [{ user_id: userid }, { user_id: userid_admin }]
          : [{ user_id: userid }, { user_created_by_id: userid }],
        qty: { $gt: 0 },
      };

      if (category) {
        query.category = category;
      }

      if (product_type) {
        query.product_type = product_type;
      }

      const [totalProducts, products] = await Promise.all([
        Inventory.countDocuments(query),
        Inventory.find(query)
          .skip(skip)
          .limit(limitNum)
          .populate('category')
          .populate("product_type")
          .lean(),
      ]);

      res.status(200).json({
        page: pageNum,
        limit: limitNum,
        totalProducts,
        products,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);


// GET /api/inventory/product/:id - Update a buyer by ID
router.get('/product/:id', checkAccess("inventory", "read"), async (req: Request, res: Response) => {
  try {

    console.log("id", req.params)
    const { id } = req.params;
    const updatedProduct = await Inventory.findById(id).populate("category").populate("buyer_id").populate("product_type");
    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json(updatedProduct);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/inventory/:id - Update a Product by ID
router.put('/:id', checkAccess("inventory", "edit"), async (req: Request, res: Response) => {
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
router.post('/', checkAccess("inventory", "create"), async (req: Request, res: Response) => {
  try {
    let { reference_number } = req.body;
    if (reference_number === "NaN") reference_number = "";

    // Check if inventory with same reference_number already exists
    if (reference_number) {
      console.log("reference_number", reference_number)
      console.log("user_id", req.user?.id)
      const existingInventory = await Inventory.findOne({ reference_number, user_id: req.user?.id });
      if (existingInventory) {
        return res.status(400).json({ error: 'Inventory with this reference number already exists' });
      }
    }

    const the_user = await User.findById(req.user?.id)
    const newProduct = new Inventory({ ...req.body, user_created_by_id: the_user?.created_by });
    await newProduct.save();
    createActivity({
      user_id: req.user?.id,
      user_created_by: the_user?.created_by,
      action: 'create',
      resource_type: 'inventory',
      page: 'inventory',
      type: 'inventory_created',
      description: `create new inventory ${req.body.name}`,
    });
    res.status(201).json(newProduct);
  } catch (error: any) {
    console.log("error", error)
    res.status(500).json({ error: error.message || error });
  }
});


export default router;
