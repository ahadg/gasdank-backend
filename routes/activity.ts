import { Router, Request, Response } from 'express';
import { authenticateJWT } from "../middlewares/authMiddleware";
import checkAccess from "../middlewares/accessMiddleware";
import Activity from "../models/Activity";



const router = Router();

// Optionally protect all /api/users endpoints
router.use(authenticateJWT);

// POST /api/activity
router.post('/',checkAccess("dashboad","create"), async (req: Request, res: Response) => {
    try {
      console.log("req.body",req.body)
      const newActivity = new Activity(req.body);
      await newActivity.save();
      res.status(201).json(newActivity);
    } catch (error) {
      res.status(500).json({ error });
    }
  });