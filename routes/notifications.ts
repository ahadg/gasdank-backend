import { Router, Request, Response } from 'express';
import { authenticateJWT } from "../middlewares/authMiddleware";
import checkAccess from "../middlewares/accessMiddleware";
import Notification from "../models/notification";



const router = Router();

// Optionally protect all /api/users endpoints
router.use(authenticateJWT);

export const createNotification = async (obj:any) => {
    const newNotification = new Notification(obj);
    await newNotification.save();
}

// POST /api/Notification
router.post('/:user_id',async (req: Request, res: Response) => {
    try {
      console.log("req.body",req.body)
      const { user_id } = req.params;
      const newNotification = new Notification({
        user_id,
        ...req.body
      });
      await newNotification.save();
      res.status(201).json(newNotification);
    } catch (error) {
      res.status(500).json({ error });
    }
});


export default router;