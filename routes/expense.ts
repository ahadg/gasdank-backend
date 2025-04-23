import express, { Request, Response } from 'express';
import Expense, { IExpense } from '../models/Expense'; // adjust path if needed
import mongoose from 'mongoose';
import { createActivity } from './activity';

const router = express.Router();

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

// POST a new expense
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      user_id,
      user_created_by_id,
      category_id,
      amount,
      description,
    } = req.body;

    const expense: IExpense = new Expense({
      user_id,
      user_created_by_id,
      category_id,
      amount,
      description,
    });

    await expense.save();
    
    createActivity({
      user_id : user_id, 
      user_created_by : user_created_by_id,
      action : "create",
      resource_type : "expenses",
      page : "expenses",
      type : "expense_created",
      amount: amount, // used for financial activity
      description : description,
    })
    res.status(201).json(expense);
  } catch (err) {
    console.log("",err)
    res.status(400).json({ error: 'Failed to create expense', details: err });
  }
});


export default router;
