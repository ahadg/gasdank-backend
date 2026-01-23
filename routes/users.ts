import { Router, Request, Response } from 'express';
import { authenticateJWT, AuthRequest } from '../middlewares/authMiddleware';
import User from '../models/User';
import userSchema, { userSignupSchema } from '../schemas/user';
import bcrypt from 'bcrypt';
import Transaction from '../models/Transaction';
import Inventory from '../models/Inventory';
import Buyer from '../models/Buyer';
import mongoose from 'mongoose';
import checkAccess from '../middlewares/accessMiddleware';
import { createActivity } from './activity';
import SystemSettings from '../models/SystemSettings';
import { adminDefaultAccess } from '../utils/helpers';
import Activity from '../models/Activity';
import Expense from '../models/Expense';
import Notification from '../models/notification';
import Sample from '../models/Sample';
import SampleViewingClients from '../models/SampleViewingClients';
import TransactionItem from '../models/TransactionItem';
import TransactionPayment from '../models/TransactionPayment';

import { setUserResetToken, verifyTokenAndUpdatePassword } from '../utils/passwordReset';
import { sendPasswordEmail } from '../utils/sendEmail';
const FRONTEND_URL = process.env.FRONTEND_URL

const router = Router();

// Number of salt rounds for bcrypt
const saltRounds = 10;

// GET /api/users - get all users
router.get('/', authenticateJWT, checkAccess("config.users", "read"), async (req: Request, res: Response) => {
  console.log("user", req.user)
  try {
    const the_user = await User.findById(req.user?.id)
    let users;
    if (!the_user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (the_user.role === "superadmin") {
      users = await User.find();
    } else {
      users = await User.find({ created_by: req.user?.id });
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
    res.status(200).json({ user });
  } catch (error) {
    console.log("error", error)
    res.status(500).json({ error });
  }
});

// GET /api/users/:id - get a specific user by ID
router.get('/:id', authenticateJWT, checkAccess("config.users", "read"), async (req: Request, res: Response) => {
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
router.post('/', authenticateJWT, checkAccess("config.users", "create"), async (req: Request, res: Response) => {
  try {
    // Validate request body against schema
    const { error, value } = userSchema.validate(req.body);
    console.log("req.body", req.body)
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if email OR username already exists
    const existingUser = await User.findOne({
      $or: [
        { email: value.email },
        { userName: value.userName }
      ]
    });

    if (existingUser) {
      if (existingUser.email === value.email) {
        return res.status(409).json({ error: "Email already exists" });
      }
      if (existingUser.userName === value.userName) {
        return res.status(409).json({ error: "Username already exists" });
      }
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
      user_id: newUser?._id,
      user_created_by: req.user?.id,
      action: "create",
      resource_type: 'user',
      page: "user",
      type: "user_created",
      description: `A new user ${value?.email} created`,
    })
    res.status(201).json(newUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Public Signup: No need to checkAccess middleware here
router.post('/signup', async (req: Request, res: Response) => {
  try {
    console.log("req.body", req.body)
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
      (p: any) => p.name.toLowerCase() === value.plan.toLowerCase()
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
router.patch('/:id', authenticateJWT, checkAccess("config.users", "edit"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // If password is provided, hash it before updating
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, saltRounds);
    } else {
      delete updateData.password
    }
    console.log("updateData", updateData)
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
router.put('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id, ...updateData } = req.body;
    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error });
  }
});

router.put('/:user_id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const updatedUser = await User.findByIdAndUpdate(user_id, req.body, { new: true });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// DELETE /api/users - soft delete a user
router.delete('/', authenticateJWT, checkAccess("config", "delete"), async (req: Request, res: Response) => {
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
    console.log("resetLink***", resetLink)
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

router.get(
  "/stats/:user_id",
  authenticateJWT,
  checkAccess("dashboard", "read"),
  async (req: Request, res: Response) => {
    try {
      const { user_id } = req.params;
      if (!user_id) {
        return res.status(400).json({ error: "user_id parameter is required" });
      }

      const userObjectId = new mongoose.Types.ObjectId(user_id);
      const the_user = await User.findById(userObjectId);
      if (!the_user) {
        return res.status(400).json({ error: "User not found" });
      }

      // Build list of user_ids to query (include self, admin, and fellow workers)
      let rootAdminId: mongoose.Types.ObjectId;
      if (the_user.role === "admin" || the_user.role === "superadmin") {
        rootAdminId = userObjectId;
      } else {
        rootAdminId = the_user.created_by || userObjectId;
      }

      // find all users in this group (the admin and all users they created)
      const groupUsers = await User.find(
        { $or: [{ _id: rootAdminId }, { created_by: rootAdminId }] },
        { _id: 1, cash_balance: 1, other_balance: 1 }
      ).lean();

      const userIds = groupUsers.map((u) => u._id as mongoose.Types.ObjectId);

      // Aggregate balances across the group
      let groupCashBalance = 0;
      let groupOtherBalance: any = {};

      groupUsers.forEach((u: any) => {
        groupCashBalance += Number(u.cash_balance || 0);
        if (u.other_balance && typeof u.other_balance === 'object') {
          Object.entries(u.other_balance).forEach(([key, value]) => {
            groupOtherBalance[key] = (groupOtherBalance[key] || 0) + Number(value || 0);
          });
        }
      });

      // Build a date filter if provided
      let dateFilter: any = {};
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate);
      }

      const dateCondition =
        Object.keys(dateFilter).length > 0 ? { created_at: dateFilter } : {};

      // === AGGREGATIONS ===

      // Total Sales
      const totalSalesAgg = await Transaction.aggregate([
        {
          $match: {
            user_id: { $in: userIds },
            type: "sale",
            sale_price: { $exists: true },
            ...dateCondition,
          },
        },
        { $group: { _id: null, totalSales: { $sum: "$sale_price" } } },
      ]);
      const totalSales = totalSalesAgg[0]?.totalSales || 0;

      // Total Return
      const totalSalesProductReturnAgg = await Transaction.aggregate([
        {
          $match: {
            user_id: { $in: userIds },
            type: "return",
            sale_price: { $exists: true },
            ...dateCondition,
          },
        },
        { $group: { _id: null, totalSales: { $sum: "$sale_price" } } },
      ]);
      const totalSalesReturn = totalSalesProductReturnAgg[0]?.totalSales || 0;

      // Total Profit
      const totalProfitAgg = await Transaction.aggregate([
        {
          $match: {
            user_id: { $in: userIds },
            type: "sale",
            profit: { $exists: true },
            ...dateCondition,
          },
        },
        { $group: { _id: null, totalProfit: { $sum: "$profit" } } },
      ]);
      const totalProfit = totalProfitAgg[0]?.totalProfit || 0;

      // Profit Return
      const totalProductReturnProfitAgg = await Transaction.aggregate([
        {
          $match: {
            user_id: { $in: userIds },
            type: "return",
            profit: { $exists: true },
            ...dateCondition,
          },
        },
        { $group: { _id: null, totalProfit: { $sum: "$profit" } } },
      ]);
      const totalProfitReturn =
        totalProductReturnProfitAgg[0]?.totalProfit || 0;

      // Inventory Value
      const inventoryValueAgg = await Inventory.aggregate([
        { $match: { user_id: { $in: userIds } } },
        {
          $group: {
            _id: null,
            inventoryValue: {
              $sum: {
                $multiply: [
                  { $add: ["$price", { $ifNull: ["$shippingCost", 0] }] },
                  "$qty",
                ],
              },
            },
          },
        },
      ]);
      const rawInventoryValue = inventoryValueAgg[0]?.inventoryValue || 0;

      // Client Payables (positive balances)
      const clientPayableAgg = await Buyer.aggregate([
        {
          $match: {
            $or: [{ user_id: { $in: userIds } }, { admin_id: { $in: userIds } }],
            currentBalance: { $gt: 0 },
          },
        },
        { $group: { _id: null, outstanding: { $sum: "$currentBalance" } } },
      ]);
      const clientPayableBalances = clientPayableAgg[0]?.outstanding || 0;

      // Company Payables (negative balances)
      const companyPayableAgg = await Buyer.aggregate([
        {
          $match: {
            $or: [{ user_id: { $in: userIds } }, { admin_id: { $in: userIds } }],
            currentBalance: { $lt: 0 },
          },
        },
        { $group: { _id: null, outstanding: { $sum: "$currentBalance" } } },
      ]);
      const rawCompanyPayableBalance = companyPayableAgg[0]?.outstanding || 0;


      // Final Balance Calculation
      const rawCompanyBalance =
        rawInventoryValue +
        clientPayableBalances
        +
        Number(groupCashBalance || 0) +
        // Number(user?.other_balance?.EFT || 0) +
        // Number(user?.other_balance?.Crypto || 0)
        -
        Math.abs(Number(rawCompanyPayableBalance));
      console.log({
        rawInventoryValue, clientPayableBalances, groupCashBalance,
        groupOtherBalance,
        rawCompanyPayableBalance,
        finalCompanybalance: rawCompanyBalance
      })
      // Helper formatter
      const formatNumber = (value: any): number => {
        const num = Number(value) || 0;
        return parseFloat(num.toFixed(2));
      };

      res.status(200).json({
        totalSales: formatNumber(totalSales - totalSalesReturn),
        totalProfit: formatNumber(totalProfit - totalProfitReturn),
        inventoryValue: formatNumber(rawInventoryValue),
        clientPayableBalances: formatNumber(clientPayableBalances),
        companyPayableBalance: formatNumber(rawCompanyPayableBalance),
        companyBalance: formatNumber(rawCompanyBalance),
        other_balance: groupOtherBalance,
        user: the_user,
        groupCashBalance
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// DELETE /api/users/clean-data/:user_id - Clean all data for a specific user
router.delete(
  "/clean-data/:user_id",
  authenticateJWT,
  //checkAccess("config.users", "delete"),
  async (req: any, res: Response) => {
    try {
      const { user_id } = req.params;

      if (!user_id) {
        return res.status(400).json({ error: "user_id parameter is required" });
      }

      const userObjectId = new mongoose.Types.ObjectId(user_id);

      // Verify user exists
      const user = await User.findById(userObjectId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if requester is admin/superadmin to determine if we should also clean data of users created by this user
      const requesterRole = req.user?.role;
      const isAdminRequest = requesterRole === 'admin' || requesterRole === 'superadmin';

      let childUserIds: mongoose.Types.ObjectId[] = [];
      if (isAdminRequest) {
        const childUsers = await User.find({ created_by: userObjectId }, { _id: 1 });
        childUserIds = childUsers.map((u: any) => u._id);
      }

      // Collect all IDs to clean up
      const allTargetUserIds = [userObjectId, ...childUserIds];

      // Start deletion process
      const deletionResults: any = {
        user_id,
        isAdminRequest,
        childUsersCount: childUserIds.length,
        deleted: {},
        errors: []
      };

      try {
        // Delete Activities
        const activityResult = await Activity.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { user_created_by: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.activities = activityResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'Activity', error: error.message });
      }

      try {
        // Delete Buyers
        const buyerResult = await Buyer.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { admin_id: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.buyers = buyerResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'Buyer', error: error.message });
      }

      try {
        // Delete Expenses
        const expenseResult = await Expense.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { user_created_by_id: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.expenses = expenseResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'Expense', error: error.message });
      }

      try {
        // Delete Inventory
        const inventoryResult = await Inventory.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { user_created_by_id: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.inventory = inventoryResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'Inventory', error: error.message });
      }

      try {
        // Delete Notifications
        const notificationResult = await Notification.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { actorId: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.notifications = notificationResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'Notification', error: error.message });
      }

      try {
        // Delete Samples
        const sampleResult = await Sample.deleteMany({
          user_id: { $in: allTargetUserIds }
        });
        deletionResults.deleted.samples = sampleResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'Sample', error: error.message });
      }

      try {
        // Delete SampleViewingClients
        const sampleViewingResult = await SampleViewingClients.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { user_created_by: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.sampleViewingClients = sampleViewingResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'SampleViewingClients', error: error.message });
      }

      try {
        // Delete TransactionItems
        const transactionItemResult = await TransactionItem.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { admin_id: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.transactionItems = transactionItemResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'TransactionItem', error: error.message });
      }

      try {
        // Delete TransactionPayments
        const transactionPaymentResult = await TransactionPayment.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { admin_id: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.transactionPayments = transactionPaymentResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'TransactionPayment', error: error.message });
      }

      try {
        // Delete Transactions
        const transactionResult = await Transaction.deleteMany({
          $or: [
            { user_id: { $in: allTargetUserIds } },
            { admin_id: { $in: allTargetUserIds } }
          ]
        });
        deletionResults.deleted.transactions = transactionResult.deletedCount;
      } catch (error: any) {
        deletionResults.errors.push({ model: 'Transaction', error: error.message });
      }

      try {
        // Reset Primary User balances
        const userUpdateResult = await User.findByIdAndUpdate(
          userObjectId,
          {
            $set: {
              cash_balance: 0,
              other_balance: {}
            }
          },
          { new: true }
        );
        deletionResults.userBalancesReset = true;
        deletionResults.updatedUser = {
          cash_balance: userUpdateResult?.cash_balance,
          other_balance: userUpdateResult?.other_balance
        };

        // If admin request, also delete the child users themselves
        if (isAdminRequest && childUserIds.length > 0) {
          const userDeleteResult = await User.deleteMany({ _id: { $in: childUserIds } });
          deletionResults.deleted.childUsers = userDeleteResult.deletedCount;
        }
      } catch (error: any) {
        deletionResults.errors.push({ model: 'User', error: error.message });
        deletionResults.userBalancesReset = false;
      }

      // Log the cleanup activity
      createActivity({
        user_id: userObjectId,
        user_created_by: req.user?.id,
        action: 'delete',
        resource_type: 'user_data',
        page: 'user',
        type: 'user_data_cleanup',
        description: `All data cleaned for user ${user.email}${isAdminRequest ? ` and ${childUserIds.length} secondary users` : ''}`,
      });

      res.status(200).json({
        message: 'User data cleanup completed',
        ...deletionResults
      });

    } catch (error: any) {
      console.error('User data cleanup error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);






// POST /api/users/check-exists - Check if email or username already exists
router.post('/check-exists', async (req: Request, res: Response) => {
  try {
    const { email, userName } = req.body;

    if (!email && !userName) {
      return res.status(400).json({ error: "At least email or userName is required" });
    }

    const query: any = { $or: [] };
    if (email) query.$or.push({ email });
    if (userName) query.$or.push({ userName });

    const existingUser = await User.findOne(query);

    if (existingUser) {
      return res.status(200).json({
        exists: true,
        emailExists: email ? existingUser.email === email : false,
        userNameExists: userName ? existingUser.userName === userName : false
      });
    }

    res.status(200).json({ exists: false });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


export default router;
