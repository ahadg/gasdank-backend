import { Router, Request, Response } from 'express';
import { authenticateJWT } from "../middlewares/authMiddleware";
import checkAccess from "../middlewares/accessMiddleware";
import Activity from "../models/Activity";
import { createNotification } from './notifications';
import mongoose from 'mongoose';


const router = Router();

router.use(authenticateJWT);

export const createActivity = async (obj: any): Promise<any> => {
  const newActivity = new Activity(obj);
  return await newActivity.save();
}

// POST /api/activity
router.post('/:user_id', async (req: Request, res: Response) => {
  try {
    console.log("req.body", req.body);
    const { user_id } = req.params;

    const newActivity = new Activity({
      user_id,
      ...req.body,
    });

    const savedActivity = await newActivity.save();
    console.log("newActivity_res", savedActivity);

    // if (req.body?.type === "balance_modification") {
    //   createNotification({
    //     user_id,
    //     type: "balance_modification",
    //     description: `${req.body?.amount} ${req.body?.payment_method} has been added`,
    //     activityId: savedActivity._id,
    //   });
    // }

    res.status(201).json(savedActivity);
  } catch (error) {
    console.error("Activity POST error:", error);
    res.status(500).json({ error });
  }
});


router.get('/:userid',
  //checkAccess("activitylogs","read"),
  async (req: Request, res: Response) => {
    try {
      const { userid } = req.params;
      const userObjectId = new mongoose.Types.ObjectId(userid);
      const { type, page, limit, from, to } = req.query;
      console.log("", { type, page, limit, from, to, userid });

      // Convert page and limit to numbers (default values: page 1, limit 10)
      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = parseInt(limit as string, 10) || 10;
      const skip = (pageNum - 1) * limitNum;

      // Build the match stage for aggregation
      const matchQuery: any = {
        $or: [
          { user_id: userObjectId },
          { user_created_by: userObjectId }
        ]
      };

      if (type) {
        matchQuery.type = { $eq: type };
      }

      if (from || to) {
        matchQuery.created_at = {};
        if (from) {
          matchQuery.created_at.$gte = new Date(from as string);
        }
        if (to) {
          matchQuery.created_at.$lte = new Date(to as string);
        }
      }

      console.log("matchQuery", matchQuery);

      const pipeline = [
        { $match: matchQuery },
        // Add sort stage here, before facet
        { $sort: { created_at: -1 as -1 } }, // or createdAt: -1 depending on your field name
        {
          $facet: {
            logs: [
              { $skip: skip },
              { $limit: limitNum },
              // Perform lookups for buyer and user details if needed.
              {
                $lookup: {
                  from: 'buyers', // Adjust the collection name if necessary.
                  localField: 'buyer_id',
                  foreignField: '_id',
                  as: 'buyer_id'
                }
              },
              {
                $lookup: {
                  from: 'users', // Adjust the collection name if necessary.
                  localField: 'user_id',
                  foreignField: '_id',
                  as: 'user_id'
                }
              },
              {
                $lookup: {
                  from: 'transactions', // <-- make sure this matches your collection name
                  localField: 'transaction_id',
                  foreignField: '_id',
                  as: 'transaction_id'
                }
              },
              {
                $lookup: {
                  from: 'users', // <-- make sure this matches your collection name
                  localField: 'worker_id',
                  foreignField: '_id',
                  as: 'worker'
                }
              },
              // Optionally, unwind to convert arrays to single objects.
              { $unwind: { path: "$user_id", preserveNullAndEmptyArrays: true } },
              { $unwind: { path: "$buyer_id", preserveNullAndEmptyArrays: true } }
            ],
            totalCount: [
              { $count: "count" }
            ]
          }
        }
      ];

      const result = await Activity.aggregate(pipeline);
      const logs = result[0].logs;
      const totalCount = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

      res.status(200).json({
        page: pageNum,
        limit: limitNum,
        totallogs: totalCount,
        logs
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);


export default router;