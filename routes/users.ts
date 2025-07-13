import { Router, Request, Response } from 'express';
import { authenticateJWT, AuthRequest } from '../middlewares/authMiddleware';
import User from '../models/User';
import userSchema,{userSignupSchema} from '../schemas/user';
import bcrypt from 'bcrypt';
import Transaction from '../models/Transaction';
import Inventory from '../models/Inventory';
import Buyer from '../models/Buyer';
import mongoose from 'mongoose';
import checkAccess from '../middlewares/accessMiddleware';
import { createActivity } from './activity';
import SystemSettings from '../models/SystemSettings';
import { adminDefaultAccess } from '../utils/helpers';

import { setUserResetToken, verifyTokenAndUpdatePassword } from '../utils/passwordReset';
import { sendPasswordEmail } from '../utils/sendEmail';
const FRONTEND_URL = process.env.FRONTEND_URL

const router = Router();

// Number of salt rounds for bcrypt
const saltRounds = 10;

// GET /api/users - get all users
router.get('/',authenticateJWT, checkAccess("config.users","read"), async (req: Request, res: Response) => {
  console.log("user",req.user)
  try {
    const the_user = await User.findById(req.user?.id)
    let users;
    if(the_user.role === "superadmin") {
      users = await User.find();
    } else {
      users = await User.find({created_by : req.user?.id});
    }
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET /api/users/me - get a specific user by ID
router.get('/me', authenticateJWT, async (req: any, res: Response) => { 

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({user});
  } catch (error) {
    console.log("error",error)
    res.status(500).json({ error });
  }
});

// GET /api/users/:id - get a specific user by ID
router.get('/:id',authenticateJWT,checkAccess("config.users","read"), async (req: Request, res: Response) => {
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
router.post('/',authenticateJWT,checkAccess("config.users","create"), async (req: Request, res: Response) => {
  try {
    // Validate request body against schema
    const { error, value } = userSchema.validate(req.body);
    console.log("req.body",req.body)
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

// Public Signup: No need to checkAccess middleware here
router.post('/signup', async (req: Request, res: Response) => {
  try {
    console.log("req.body",req.body)
    // Validate request body
    const { error, value } = userSignupSchema.validate(req.body)
    if (error) {
      return res.status(400).json({ error: error.details[0].message })
    }

    console.log('Signup req.body', value)

    // Check if email or username already exists
    const existingUser = await User.findOne({
      $or: [{ email: value.email }, { userName: value.userName }],
    })

    if (existingUser) {
      return res.status(409).json({ error: 'Email or Username already exists' })
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(value.password, 10)
    value.password = hashedPassword
    value.inventory_value = 0
    value.balance = 0
    value.other_balance = {}
    value.cash_balance = 0
    value.access = adminDefaultAccess
    value.role = 'admin'
    value.created_at = new Date()
    value.updated_at = new Date()

    // Validate selected plan
    const systemSettings = await SystemSettings.findOne()
    const validPlan = systemSettings?.plans?.find(
      (p : any) => p.name.toLowerCase() === value.plan.toLowerCase()
    )
    if (!validPlan) {
      return res.status(400).json({ error: 'Selected plan is invalid' })
    }

    value.plan = validPlan.name

    // Create and save new user
    const newUser = new User(value)
    await newUser.save()

    // Log activity (optional for signup)
    createActivity({
      user_id: newUser._id,
      user_created_by: null,
      action: 'create',
      resource_type: 'user',
      page: 'signup',
      type: 'user_created',
      description: `User ${value.email} signed up`,
    })

    res.status(201).json({
      message: 'Signup successful',
      newUser,
      user: {
        id: newUser._id,
        email: newUser.email,
        userName: newUser.userName,
        plan: newUser.plan,
      },
    })
  } catch (error: any) {
    console.error('Signup Error:', error)
    res.status(500).json({ error: error.message })
  }
})


// PATCH /api/users/:id - update a user (with password hashing if password is provided)
router.patch('/:id',authenticateJWT,checkAccess("config.users","edit"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // If password is provided, hash it before updating
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, saltRounds);
    } else {
       delete updateData.password
    }
    console.log("updateData",updateData)
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
router.put('/',authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id, ...updateData } = req.body;
    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error });
  }
});

router.put('/:user_id',authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const updatedUser = await User.findByIdAndUpdate(user_id, req.body, { new: true });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// DELETE /api/users - soft delete a user
router.delete('/', authenticateJWT, checkAccess("config","delete") ,async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    await User.findByIdAndUpdate(id, { deleted_at: new Date() });
    res.status(200).json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error });
  }
});

/** 1. Request reset link */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { user, rawToken } = await setUserResetToken(email);
    if (!user) {
      // Don’t reveal user existence
      return res.status(200).json({ message: 'If the email exists, a reset link was sent.' });
    }

    const resetLink = `${FRONTEND_URL}/auth/reset-password?token=${rawToken}`;
    console.log("resetLink***",resetLink)
    await sendPasswordEmail(email, resetLink);

    res.status(200).json({ message: 'If the email exists, a reset link was sent.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** 2. Actually reset the password */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ error: 'Token and new password are required' });

    const user = await verifyTokenAndUpdatePassword(token, password);
    if (!user) return res.status(400).json({ error: 'Token is invalid or expired' });

    // (Optional) auto‑login: issue new JWT here
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/stats/:user_id', authenticateJWT, checkAccess("dashboard", "read"), async (req: Request, res: Response) => {
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
    console.log({startDate,endDate})
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
    const totalSales = (totalSalesAgg[0]?.totalSales || 0).toFixed(2)

    // total return products
    const totalSalesProductReturnAgg = await Transaction.aggregate([
      { 
        $match: { 
          user_id: userObjectId, 
          type: "return", 
          sale_price: { $exists: true },
          ...dateCondition
        } 
      },
      { $group: { _id: null, totalSales: { $sum: "$sale_price" } } }
    ]);
    const totalSalesReturn = (totalSalesProductReturnAgg[0]?.totalSales || 0).toFixed(2)

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
    const totalProfit = (totalProfitAgg[0]?.totalProfit || 0).toFixed(2)

    // 2. Total Profit of return products: Sum of profit from "return" transactions for this user.
    const totalProductReturnProfitAgg = await Transaction.aggregate([
      { 
        $match: { 
          user_id: userObjectId, 
          type: "return", 
          profit: { $exists: true },
          ...dateCondition
        } 
      },
      { $group: { _id: null, totalProfit: { $sum: "$profit" } } }
    ]);
    const totalProfitReturn = (totalProductReturnProfitAgg[0]?.totalProfit || 0).toFixed(2)

    // 3. Inventory Value: Sum over all Inventory documents (price * qty) for this user.
    const inventoryValueAgg = await Inventory.aggregate([
      { $match: { user_id: userObjectId } },
      {
        $group: {
          _id: null,
          inventoryValue: {
            $sum: {
              $multiply: [
                { $add: ["$price", { $ifNull: ["$shippingCost", 0] }] },
                "$qty"
              ]
            }
          }
        }
      }
    ]);
    
    
    // Round inventory value to avoid floating point precision issues
    const rawInventoryValue = inventoryValueAgg[0]?.inventoryValue || 0;
    const inventoryValue = rawInventoryValue.toFixed(2)

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
    const rawCompanyPayableBalance = companyPayableAgg[0]?.outstanding || 0;
    const companyPayableBalance = (rawCompanyPayableBalance).toFixed(2)

    // Get the logged-in user's financial details.
    const user = await User.findById(userObjectId);
    
    // 6. Company Balance: Fixed calculation to avoid floating-point precision issues
    console.log({
      rawInventoryValue,
      inventoryValue,
      clientPayableBalances,
      companyPayableBalance,
      cash_balance: user?.cash_balance || 0
    });

    // Debug: Log individual components for analysis
    console.log('=== BALANCE CALCULATION DEBUG ===');
    console.log('Raw inventoryValue:', inventoryValue);
    console.log('Raw clientPayableBalances:', clientPayableBalances);
    console.log('Raw companyPayableBalance:', companyPayableBalance);
    console.log('User other_munual_balance:', user?.other_munual_balance || 0);
    console.log('Math.abs(companyPayableBalance):', Math.abs(companyPayableBalance));

    // Calculate company balance without floating-point precision issues
    const rawCompanyBalance = Number(inventoryValue) + clientPayableBalances 
    + (user?.cash_balance || 0) 
    - Math.abs(Number(companyPayableBalance));
    const companyBalance = rawCompanyBalance.toFixed(2)// Round to 2 decimal places
    
    console.log('Raw company balance calculation:', rawCompanyBalance);
    console.log('Final company balance:', companyBalance);
    console.log('=== END DEBUG ===');

    // Helper function to safely format numbers
    const formatNumber = (value: any): number => {
      const num = Number(value) || 0;
      return parseFloat(num.toFixed(2));
    };

    res.status(200).json({
      totalSales: formatNumber(totalSales - totalSalesReturn),
      totalProfit: formatNumber(totalProfit - totalProfitReturn),
      inventoryValue: formatNumber(inventoryValue),
      clientPayableBalances: formatNumber(clientPayableBalances),
      companyPayableBalance: formatNumber(companyPayableBalance),
      manual_balance: formatNumber(user?.manual_balance),
      // onlineBalance: formatNumber(user?.online_balance),
      companyBalance: formatNumber(companyBalance),
      other_balance: formatNumber(user?.other_balance),
      other_munual_balance: (user?.other_munual_balance),
      user : user
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


export default router;
