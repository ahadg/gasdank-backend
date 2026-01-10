import express, { Request, Response } from 'express';
import Expense, { IExpense } from '../models/Expense'; // adjust path if needed
import mongoose from 'mongoose';
import { createActivity } from './activity';
import { authenticateJWT } from '../middlewares/authMiddleware';
import Category from '../models/Category';
import User from '../models/User';
import Transaction from '../models/Transaction';

const router = express.Router();

// GET /api/summary/:userId?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/summary/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { start, end } = req.query;
    console.log("userId", userId)
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const startDate = start ? new Date(start as string) : new Date('1970-01-01');
    const endDate = end ? new Date(end as string) : new Date();

    // Fetch total profit from transactions
    const profitAgg = await Transaction.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
          type: 'sale',
          created_at: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalProfit: { $sum: '$profit' }
        }
      }
    ]);

    const totalProfit = profitAgg.length > 0 ? profitAgg[0].totalProfit : 0;

    // Fetch total expenses
    const expenseAgg = await Expense.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          created_at: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' }
        }
      }
    ]);

    const totalExpenses = expenseAgg.length > 0 ? expenseAgg[0].totalExpenses : 0;

    // Revenue = Profit + Expenses
    const totalRevenue = totalProfit + totalExpenses;

    res.status(200).json({
      totalRevenue,
      totalProfit,
      totalExpenses,
      netProfit: totalProfit - totalExpenses
    });
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Failed to fetch summary', details: err });
  }
});


// POST a new expense
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      user_id,
      user_created_by_id,
      category_id,
      category_name,
      amount,
      description = `Expenses from bot ${amount}`,
    } = req.body;

    let finalCategoryId = category_id;

    if (!finalCategoryId && category_name) {
      const category = await Category.findOne({ name: category_name });
      if (!category) {
        return res.status(400).json({ error: 'Invalid category name provided' });
      }
      finalCategoryId = category._id;
    }

    if (!finalCategoryId) {
      return res.status(400).json({ error: 'Category ID or name is required' });
    }


    const balanceOwner = await User.getBalanceOwner(user_id);
    if (balanceOwner) {
      await User.findByIdAndUpdate(balanceOwner._id, {
        $inc: { cash_balance: -amount }
      });
    }

    const expense: IExpense = new Expense({
      user_id,
      user_created_by_id,
      category_id: finalCategoryId,
      amount,
      description,
    });

    await expense.save();

    createActivity({
      user_id,
      user_created_by: user_created_by_id,
      action: 'create',
      resource_type: 'expenses',
      page: 'expenses',
      type: 'expense_created',
      amount,
      description,
    });

    res.status(201).json(expense);
  } catch (err) {
    console.log('Error creating expense:', err);
    res.status(400).json({ error: 'Failed to create expense', details: err });
  }
});

router.use(authenticateJWT);

// GET expense by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.status(200).json(expense);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expense', details: err });
  }
});

// GET expenses 
router.get('/', async (req: Request, res: Response) => {
  try {
    const expense = await Expense.find({ user_id: req.user?.id });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.status(200).json(expense);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expense', details: err });
  }
});

// GET expenses by user_id
router.get('/user/:userid', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const expenses = await Expense.find({ user_id: userId });
    res.status(200).json(expenses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user expenses', details: err });
  }
});

// GET expenses by user_created_by_id
router.get('/user/user_creator/:userid', async (req: Request, res: Response) => {
  try {
    const { userid } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userid)) {
      return res.status(400).json({ error: 'Invalid creator ID' });
    }

    const expenses = await Expense.find({ user_created_by_id: userid });
    res.status(200).json(expenses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expenses', details: err });
  }
});





export default router;
