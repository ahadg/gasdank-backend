import { Router, Request, Response } from 'express'
import mongoose from 'mongoose'
import { authenticateJWT } from '../middlewares/authMiddleware'
import SampleViewingClient from '../models/SampleViewingClients'
import Notification from '../models/notification'
import { createActivity } from './activity'
import User from '../models/User'
import { sendEmail } from '../utils/sendEmail'
import Buyer from '../models/Buyer'
import { sendSMS } from '../utils/sendSMS'

const router = Router()
router.use(authenticateJWT)

// GET all sessions for a user
router.get('/', async (req: Request, res: Response) => {
  const { user_created_by } = req.query
  console.log("user_created_by", user_created_by)
  
  if (!user_created_by || !mongoose.Types.ObjectId.isValid(user_created_by as string)) {
    return res.status(400).json({ error: 'Invalid or missing user_created_by ID' })
  }

  try {
    const sessions = await SampleViewingClient.find({ user_created_by }).populate("buyer_id")
    res.status(200).json(sessions)
  } catch (err: any) {
    console.error('Error fetching sessions:', err)
    res.status(500).json({ error: 'Failed to fetch sessions', details: err.message })
  }
})

// GET all pending sessions for a worker
router.get('/worker', async (req: Request, res: Response) => {
  const { user_id } = req.query
  console.log("_worker_user_id", user_id)
  
  if (!user_id || !mongoose.Types.ObjectId.isValid(user_id as string)) {
    return res.status(400).json({ error: 'Invalid or missing user_id' })
  }

  try {
    const sessions = await SampleViewingClient.find({ 
      user_id, 
      status: "pending" 
    }).populate("buyer_id")
    console.log("sessions", sessions)
    res.status(200).json(sessions)
  } catch (err: any) {
    console.error('Error fetching sessions:', err)
    res.status(500).json({ error: 'Failed to fetch sessions', details: err.message })
  }
})

// POST create a new viewing session
router.post('/', async (req: Request, res: Response) => {
  try {
    const { buyer_id, user_id, items, notes } = req.body;
    const user_created_by = req.user?.id;
    console.log("req.body", req.body);

    if (!buyer_id || !user_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newSession = new SampleViewingClient({
      buyer_id,
      user_created_by,
      user_id,
      items,
      status: 'pending',
      notes,
    });

    await newSession.save();

    const newActivity = await createActivity({
      user_id: user_created_by, 
      buyer_id: buyer_id,
      action: "create",
      resource_type: "sample",
      resource_id: newSession?._id,
      page: "sampleviewing",
      type: "sample_viewing_assigned",
      description: `Assigned a new sample viewing session with ${items.length} item${items.length > 1 ? 's' : ''}`,
    })
    
    try {
      // Notification for the assigned worker
      const workerNotification = new Notification({
        user_id: user_id, // recipient (worker)
        actorId: user_created_by, // person who created the session
        type: 'sample_viewing_assigned',
        message: `You have been assigned a new sample viewing session with ${items.length} item${items.length > 1 ? 's' : ''}`,
        activityId: newActivity._id, // reference to the sample viewing session
        isRead: false
      });

      // Save notification
      workerNotification.save()

      console.log('Notifications created successfully for buyer:', buyer_id, 'and worker:', user_id);
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the entire request if notification fails
    }

    res.status(201).json(newSession);
  } catch (err: any) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: 'Failed to create session', details: err.message });
  }
});

// PATCH update session status
router.patch('/:sessionId/status', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params
    const { status,transaction_id } = req.body
    console.log("req.body",req.body)
    if (!status || !['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, accepted, or rejected' })
    }

    const session = await SampleViewingClient.findById(sessionId)
    if (!session) return res.status(404).json({ error: 'Session not found' })

    // Update session status
    // session.status = status
    // await session.save()
    console.log("req.user",req.user)
    const the_user = await User.findById(req.user?.id);
    // Create activity log for the status update
    try {
      const productSummary = session.items
        .map((p : any) => `"${p.name.trim()}" (x${p.qty})`)
        .join(', ');
      // create activity logs for admin
      await createActivity({
        user_id: the_user?.created_by,
        buyer_id: session.buyer_id,
        worker_id: req.user?.id,
        transaction_id,
        action: "update",
        resource_type: "sample",
        resource_id: session._id,
        page: "sampleviewing",
        type: `sample_viewing_${status}`,
        description: `Sample session updated to "${status}". Products: ${productSummary}.`
      });

      //create activity logs for user
      await createActivity({
        user_id: req.user?.id,
        buyer_id: session.buyer_id,
        action: "update", 
        transaction_id,
        resource_type: "sample",
        resource_id: session._id,
        page: "sampleviewing",
        type: `sample_viewing_${status}`,
        description: `Sample session updated to "${status}". Products: ${productSummary}.`
      })

      // notify client
      const buyer = await Buyer.findById(session.buyer_id)
      sendSMS({
        to : buyer?.phone,
        message : `Sample "${status}" by ${the_user?.name}. Products: ${productSummary}.`
      })

      
    } catch (activityError) {
      console.error('Error creating activity:', activityError)
      // Don't fail the request if activity logging fails
    }

    res.status(200).json({ 
      message: `Session status updated to ${status} successfully`, 
      session: await SampleViewingClient.findById(sessionId).populate("buyer_id")
    })
  } catch (err: any) {
    console.error('Error updating session status:', err)
    res.status(500).json({ error: 'Failed to update session status', details: err.message })
  }
})

export default router