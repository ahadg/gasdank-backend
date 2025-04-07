import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middlewares/authMiddleware';
import User from '../models/User';
import userSchema from '../schemas/user';
import bcrypt from 'bcrypt';
import Transaction from '../models/Transaction';
import Inventory from '../models/Inventory';
import Buyer from '../models/Buyer';
import mongoose from 'mongoose';
import checkAccess from '../middlewares/accessMiddleware';
import { createActivity } from './activity';

const router = Router();

// Optionally protect all /api/users endpoints
router.use(authenticateJWT);

// Number of salt rounds for bcrypt
const saltRounds = 10;

// GET /api/users - get all users
router.get('/', checkAccess("config","read"), async (req: Request, res: Response) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET /api/users/:id - get a specific user by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// POST /api/users - create a new user
router.post('/',checkAccess("config","create"), async (req: Request, res: Response) => {
  try {
    // Validate request body against schema
    const { error, value } = userSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if a user with the given email already exists
    const existingUser = await User.findOne({ email: value.email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash the password before saving the user
    const hashedPassword = await bcrypt.hash(value.password, saltRounds);
    value.password = hashedPassword;
    value.created_by = req.user?.id

    // Create and save the new user
    const newUser = new User(value);
    await newUser.save();

    // create activity 
    createActivity({
      user_id : newUser?._id, 
      user_created_by : req.user?.id,
      action : "create",
      resource_type : 'user',
      page : "user",
      type : "user_created",
      description : `A new user ${value?.email} created`,
    })
    res.status(201).json(newUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/users/:id - update a user (with password hashing if password is provided)
router.patch('/:id',checkAccess("config","read"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // If password is provided, hash it before updating
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, saltRounds);
    } else {
       delete updateData.password
    }

    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(updatedUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users - update a user (alternative update route without password logic)
// You can choose to remove this route if you prefer using the PATCH route above.
router.put('/', async (req: Request, res: Response) => {
  try {
    const { id, ...updateData } = req.body;
    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error });
  }
});

router.put('/:user_id', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const updatedUser = await User.findByIdAndUpdate(user_id, req.body, { new: true });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// DELETE /api/users - soft delete a user
router.delete('/', checkAccess("config","delete") ,async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    await User.findByIdAndUpdate(id, { deleted_at: new Date() });
    res.status(200).json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error });
  }
});

// DELETE /api/users - soft delete a user
router.delete('/', checkAccess("config","delete") ,async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    await User.findByIdAndUpdate(id, { deleted_at: new Date() });
    res.status(200).json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error });
  }
});


router.get('/stats/:user_id', checkAccess("dashboard", "read"), async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(400).json({ error: "user_id parameter is required" });
    }
    const userObjectId = new mongoose.Types.ObjectId(user_id);

    // Build a date filter if provided in the query parameters.
    let dateFilter: any = {};
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }
    // Only add the date condition if at least one date is provided.
    const dateCondition = Object.keys(dateFilter).length > 0 ? { created_at: dateFilter } : {};

    // 1. Total Sales: Sum of sale_price from "sale" transactions for this user.
    const totalSalesAgg = await Transaction.aggregate([
      { 
        $match: { 
          user_id: userObjectId, 
          type: "sale", 
          sale_price: { $exists: true },
          ...dateCondition
        } 
      },
      { $group: { _id: null, totalSales: { $sum: "$sale_price" } } }
    ]);
    const totalSales = totalSalesAgg[0]?.totalSales || 0;

    // 2. Total Profit: Sum of profit from "sale" transactions for this user.
    const totalProfitAgg = await Transaction.aggregate([
      { 
        $match: { 
          user_id: userObjectId, 
          type: "sale", 
          profit: { $exists: true },
          ...dateCondition
        } 
      },
      { $group: { _id: null, totalProfit: { $sum: "$profit" } } }
    ]);
    const totalProfit = totalProfitAgg[0]?.totalProfit || 0;

    // 3. Inventory Value: Sum over all Inventory documents (price * qty) for this user.
    const inventoryValueAgg = await Inventory.aggregate([
      { $match: { user_id: userObjectId } },
      { 
        $group: { 
          _id: null, 
          inventoryValue: { 
            $sum: { 
              $add: [ 
                { $multiply: ["$price", "$qty"] }, 
                { $multiply: [ { $ifNull: ["$shippingCost", 0] }, "$qty" ] }
              ] 
            } 
          } 
        } 
      }
    ]);
    
    const inventoryValue = inventoryValueAgg[0]?.inventoryValue || 0;

    // 4. Outstanding Balances: Sum of positive currentBalance from all Buyer documents (client payable).
    const clientPayableAgg = await Buyer.aggregate([
      { $match: { user_id: userObjectId, currentBalance: { $gt: 0 } } },
      { $group: { _id: null, outstanding: { $sum: "$currentBalance" } } }
    ]);
    const clientPayableBalances = clientPayableAgg[0]?.outstanding || 0;

    // Amount we owe: Sum of negative currentBalance from all Buyer documents.
    const companyPayableAgg = await Buyer.aggregate([
      { $match: { user_id: userObjectId, currentBalance: { $lt: 0 } } },
      { $group: { _id: null, outstanding: { $sum: "$currentBalance" } } }
    ]);
    const companyPayableBalance = companyPayableAgg[0]?.outstanding || 0;

    // Get the logged-in user's financial details.
    const user = await User.findById(userObjectId);

    // 6. Company Balance: For example, calculated as:
    //    Inventory Value + Client Payable Balances + online_balance + cash_balance - (absolute value of company payable balance)
    console.log({
      inventoryValue,
      clientPayableBalances,
      companyPayableBalance,
      online_balance : user?.online_balance || 0,
      cash_balance : user?.cash_balance || 0
    })
    const companyBalance = Number(inventoryValue) + Number(clientPayableBalances) + Number(user?.cash_balance || 0) - Math.abs(companyPayableBalance);
    console.log({companyBalance})
    res.status(200).json({
      totalSales,
      totalProfit,
      inventoryValue : inventoryValue?.toFixed(2),
      clientPayableBalances,
      companyPayableBalance,
      loggedInUserTotalBalance: user?.cash_balance,
      onlineBalance: user?.online_balance,
      companyBalance : companyBalance?.toFixed(2),
      other_balance : user.other_balance
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


export default router;
