import { Router, Request, Response } from 'express';
import ProductType from '../models/ProductType';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';
import User from '../models/User';

const router = Router();
router.use(authenticateJWT);

router.get('/:userid',
    //checkAccess("config.productTypes", "read"),
    async (req: Request, res: Response) => {
        try {
            const { userid } = req.params;

            const user: any = await User.findById(userid);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            const adminId = (user.role === 'admin' || user.role === 'superadmin') ? user._id : (user.created_by || user._id);

            const usersUnderAdmin = await User.find({ created_by: adminId, deleted_at: null });
            const userIds = [adminId, ...usersUnderAdmin.map(u => u._id)];

            const productTypes = await ProductType.find({ user_id: { $in: userIds } });
            res.status(200).json(productTypes);
        } catch (error) {
            res.status(500).json({ error });
        }
    });

// POST /api/productTypes
router.post('/',
    //checkAccess("config.productTypes", "create"),
    async (req: Request, res: Response) => {
        try {
            const newProductType = new ProductType({
                ...req.body
            });
            await newProductType.save();
            res.status(201).json(newProductType);
        } catch (error) {
            res.status(500).json({ error });
        }
    });

// PUT /api/productTypes
router.put('/',
    //checkAccess("config.productTypes", "edit"),
    async (req: Request, res: Response) => {
        try {
            const { id, formData } = req.body;
            const updatedProductType = await ProductType.findByIdAndUpdate(id, formData, { new: true });
            res.status(200).json(updatedProductType);
        } catch (error) {
            res.status(500).json({ error });
        }
    });

// DELETE /api/productTypes
router.delete('/',
    //checkAccess("config.productTypes", "delete"),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.body;
            await ProductType.findByIdAndDelete(id);
            res.status(200).json({ message: 'Product Type deleted' });
        } catch (error) {
            res.status(500).json({ error });
        }
    });

export default router;
