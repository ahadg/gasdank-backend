import { Router, Request, Response } from 'express'
import mongoose from 'mongoose'
import { authenticateJWT } from '../middlewares/authMiddleware'
import SampleViewingClient from '../models/SampleViewingClients'

const router = Router()
router.use(authenticateJWT)

// GET all sessions for a worker or user
router.get('/', async (req: Request, res: Response) => {
  const { createdBy } = req.query

  if (!createdBy || !mongoose.Types.ObjectId.isValid(createdBy as string)) {
    return res.status(400).json({ error: 'Invalid or missing createdBy ID' })
  }

  try {
    const sessions = await SampleViewingClient.find({ createdBy }).populate("buyer_id")
    res.status(200).json(sessions)
  } catch (err: any) {
    console.error('Error fetching sessions:', err)
    res.status(500).json({ error: 'Failed to fetch sessions', details: err.message })
  }
})

// POST create a new viewing session
router.post('/', async (req: Request, res: Response) => {
  try {
    const { buyer_id, user_id, items, notes } = req.body
    const createdBy = req.user?.id

    if (!buyer_id || !user_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const itemsWithStatus = items.map((item: any) => ({
      ...item,
      status: 'pending',
    }))

    const newSession = new SampleViewingClient({
      buyer_id,
      createdBy,
      user_id,
      items: itemsWithStatus,
      viewingStatus: 'pending',
      notes,
    })

    await newSession.save()
    res.status(201).json(newSession)
  } catch (err: any) {
    console.error('Error creating session:', err)
    res.status(500).json({ error: 'Failed to create session', details: err.message })
  }
})

// PATCH replace full item list with new statuses
router.patch('/:sessionId/items', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params
    const { items } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' })
    }

    const session = await SampleViewingClient.findById(sessionId)
    if (!session) return res.status(404).json({ error: 'Session not found' })

    const updatedItems = session.items.map((item: any) => {
      const updated = items.find((i: any) => i.productId.toString() === item.productId.toString())
      return updated ? { ...item.toObject(), status: updated.status } : item
    })

    session.items = updatedItems
    await session.save()

    res.status(200).json({ message: 'Item statuses updated successfully', session })
  } catch (err: any) {
    console.error('Error updating item statuses:', err)
    res.status(500).json({ error: 'Failed to update item statuses', details: err.message })
  }
})

export default router
