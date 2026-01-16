import { Router, Request, Response } from 'express';
import Category from '../models/Category';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';
import User from '../models/User';

const router = Router();
router.use(authenticateJWT);

router.get('/:userid', checkAccess("config.categories", "read"), async (req: Request, res: Response) => {
  try {
    const { userid } = req.params;
    const { type = 'general' } = req.query; // Get type from query params

    const user: any = await User.findById(userid);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const adminId = (user.role === 'admin' || user.role === 'superadmin') ? user._id : (user.created_by || user._id);

    const usersUnderAdmin = await User.find({ created_by: adminId, deleted_at: null });
    const userIds = [adminId, ...usersUnderAdmin.map(u => u._id)];

    // Filter by type if provided, otherwise get all
    const query: any = { user_id: { $in: userIds } };
    if (type != 'both') {
      query.type = type;
    }

    const categories = await Category.find(query);
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// POST /api/categories
router.post('/', checkAccess("config.categories", "create"), async (req: Request, res: Response) => {
  try {
    const newCategory = new Category({
      ...req.body,
      type: req.body.type || 'general' // Default to 'general' if not provided
    });
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// PUT /api/categories
router.put('/', checkAccess("config.categories", "edit"), async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    const updatedData = {
      ...req.body?.formData,
      type: req.body?.formData?.type || 'general' // Ensure type defaults to 'general'
    };

    const updatedCategory = await Category.findByIdAndUpdate(id, updatedData, { new: true });
    res.status(200).json(updatedCategory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// DELETE /api/categories
router.delete('/', checkAccess("config.categories", "delete"), async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    await Category.findByIdAndDelete(id);
    res.status(200).json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error });
  }
});

export default router;