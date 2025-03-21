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

    // Create and save the new user
    const newUser = new User(value);
    await newUser.save();
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

router.get('/stats/:user_id',checkAccess("dashboard","read"), async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    // Require a user_id query parameter
    //const user_id = req.query.user_id as string;
    if (!user_id) {
      return res.status(400).json({ error: "user_id query parameter is required" });
    }
    const userObjectId = new mongoose.Types.ObjectId(user_id);
    
    // 1. Total Sales: Sum of sale_price from "purchase" transactions for this user.
    const totalSalesAgg = await Transaction.aggregate([
      { 
        $match: { 
          user_id: userObjectId, 
          type: "purchase", 
          sale_price: { $exists: true } 
        } 
      },
      { $group: { _id: null, totalSales: { $sum: "$sale_price" } } }
    ]);
    const totalSales = totalSalesAgg[0]?.totalSales || 0;

    // 2. Total Profit: Sum of profit from "purchase" transactions for this user.
    const totalProfitAgg = await Transaction.aggregate([
      { 
        $match: { 
          user_id: userObjectId, 
          type: "purchase", 
          profit: { $exists: true } 
        } 
      },
      { $group: { _id: null, totalProfit: { $sum: "$profit" } } }
    ]);
    const totalProfit = totalProfitAgg[0]?.totalProfit || 0;

    // 3. Inventory Value: Sum over all Inventory documents (price * qty) for this user.
    const inventoryValueAgg = await Inventory.aggregate([
      { $match: { user_id: userObjectId } },
      { $group: { _id: null, inventoryValue: { $sum: { $multiply: ["$price", "$qty"] } } } }
    ]);
    const inventoryValue = inventoryValueAgg[0]?.inventoryValue || 0;

    // 4. Outstanding Balances: amount owe by buyer, they need to pay us.
    const outstandingBalancesAgg = await Buyer.aggregate([
      { $match: { user_id: userObjectId, currentBalance: { $lt: 0 } } },
      { $group: { _id: null, outstanding: { $sum: "$currentBalance" } } }
    ]);
    const outstandingBalances = outstandingBalancesAgg[0]?.outstanding || 0;
    
    // 5. Logged in User Balances: Get the currentBalance for the logged-in user.
    let allbuyertotalBalance = 0;
    const loggedInBuyer = await Buyer.findOne({ user_id: userObjectId });
    allbuyertotalBalance = loggedInBuyer?.currentBalance || 0;

    let loggedInUserTotalBalance = 0
    const totalbalance = await Transaction.aggregate([
      { 
        $match: { 
          user_id: userObjectId, 
          type: "payment", 
          //profit: { $exists: true } 
        } 
      },
      { $group: { _id: null, total: { $sum: "$price" } } }
    ]);
    loggedInUserTotalBalance = totalbalance[0]?.total || 0

    const user = await User.findById(userObjectId)

    // 6. Company Balances: For example, inventory value + logged in user's balance - outstanding balances.
    const companyBalance = inventoryValue  + outstandingBalances - allbuyertotalBalance;

    res.status(200).json({ totalSales, totalProfit, inventoryValue, outstandingBalances,loggedInUserTotalBalance,user,onlineBalance : user?.online_balance, companyBalance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
