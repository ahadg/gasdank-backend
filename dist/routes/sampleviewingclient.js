"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const SampleViewingClients_1 = __importDefault(require("../models/SampleViewingClients"));
const notification_1 = __importDefault(require("../models/notification"));
const activity_1 = require("./activity");
const User_1 = __importDefault(require("../models/User"));
const Inventory_1 = __importDefault(require("../models/Inventory"));
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateJWT);
// GET all sessions for a user
// helper: build accessible userIds list
const getAccessibleUserIds = async (userId) => {
    const user = await User_1.default.findById(userId);
    if (!user)
        return [];
    let userIds = [
        new mongoose_1.default.Types.ObjectId(String(userId)),
    ];
    if (user.role === "admin") {
        // admin → include all created users
        const createdUsers = await User_1.default.find({ created_by: user._id }, { _id: 1 }).lean();
        const createdUserIds = createdUsers.map((u) => u._id);
        userIds = [user._id, ...createdUserIds];
    }
    else if (user.created_by) {
        // normal user → include self + admin
        userIds = [user._id, user.created_by];
    }
    return userIds;
};
// GET all sessions for a user/admin
router.get("/", async (req, res) => {
    const { user_created_by, status } = req.query;
    if (!user_created_by || !mongoose_1.default.Types.ObjectId.isValid(user_created_by)) {
        return res.status(400).json({ error: "Invalid or missing user_created_by ID" });
    }
    try {
        const userIds = await getAccessibleUserIds(user_created_by);
        let query = { user_created_by: { $in: userIds } };
        if (status) {
            query.status = status;
        }
        const sessions = await SampleViewingClients_1.default.find(query).populate("buyer_id");
        res.status(200).json(sessions);
    }
    catch (err) {
        console.error("Error fetching sessions:", err);
        res
            .status(500)
            .json({ error: "Failed to fetch sessions", details: err.message });
    }
});
// GET all pending sessions for a worker
router.get("/worker", async (req, res) => {
    const { user_id } = req.query;
    if (!user_id || !mongoose_1.default.Types.ObjectId.isValid(user_id)) {
        return res.status(400).json({ error: "Invalid or missing user_id" });
    }
    try {
        const userIds = await getAccessibleUserIds(user_id);
        const sessions = await SampleViewingClients_1.default.find({
            user_id: { $in: userIds },
            status: "pending",
        }).populate("buyer_id");
        res.status(200).json(sessions);
    }
    catch (err) {
        console.error("Error fetching sessions:", err);
        res
            .status(500)
            .json({ error: "Failed to fetch sessions", details: err.message });
    }
});
// POST create a new viewing session
router.post('/', async (req, res) => {
    try {
        const { buyer_id, user_id, items, notes } = req.body;
        const user_created_by = req.user?.id;
        console.log("req.body", req.body);
        if (!buyer_id || !user_id || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Check inventory quantities
        for (const item of items) {
            const inventoryItem = await Inventory_1.default.findById(item.productId);
            if (!inventoryItem) {
                return res.status(404).json({ error: `Product with ID ${item.productId} not found` });
            }
            if (item.qty > inventoryItem.qty) {
                return res.status(400).json({
                    error: `Insufficient quantity for item ${item.name || inventoryItem.name}. Requested: ${item.qty}, Available: ${inventoryItem.qty}`
                });
            }
        }
        const newSession = new SampleViewingClients_1.default({
            buyer_id,
            user_created_by,
            user_id,
            items,
            status: 'pending',
            notes,
        });
        await newSession.save();
        const newActivity = await (0, activity_1.createActivity)({
            user_id: user_created_by,
            buyer_id: buyer_id,
            action: "create",
            resource_type: "sample",
            resource_id: newSession?._id,
            page: "sampleviewing",
            type: "sample_viewing_assigned",
            description: `Assigned a new sample viewing session with ${items.length} item${items.length > 1 ? 's' : ''}`,
        });
        try {
            // Notification for the assigned worker
            const workerNotification = new notification_1.default({
                user_id: user_id, // recipient (worker)
                actorId: user_created_by, // person who created the session
                type: 'sample_viewing_assigned',
                message: `You have been assigned a new sample viewing session with ${items.length} item${items.length > 1 ? 's' : ''}`,
                activityId: newActivity._id, // reference to the sample viewing session
                isRead: false
            });
            // Save notification
            workerNotification.save();
            console.log('Notifications created successfully for buyer:', buyer_id, 'and worker:', user_id);
        }
        catch (notificationError) {
            console.error('Error creating notifications:', notificationError);
            // Don't fail the entire request if notification fails
        }
        res.status(201).json(newSession);
    }
    catch (err) {
        console.error('Error creating session:', err);
        res.status(500).json({ error: 'Failed to create session', details: err.message });
    }
});
// PATCH update session status
router.patch('/:sessionId/status', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { status, transaction_id } = req.body;
        console.log(":sessionId/status req.body", req.body);
        if (!status || !['pending', 'accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be pending, accepted, or rejected' });
        }
        const session = await SampleViewingClients_1.default.findById(sessionId);
        if (!session)
            return res.status(404).json({ error: 'Session not found' });
        // Update session status
        session.status = status;
        await session.save();
        console.log("req.user", req.user);
        const the_user = await User_1.default.findById(req.user?.id);
        // Create activity log for the status update
        try {
            const productSummary = session.items
                .map((p) => `"${p.name.trim()}" (x${p.qty})`)
                .join(', ');
            // create activity logs for admin
            await (0, activity_1.createActivity)({
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
            await (0, activity_1.createActivity)({
                user_id: req.user?.id,
                buyer_id: session.buyer_id,
                action: "update",
                transaction_id,
                resource_type: "sample",
                resource_id: session._id,
                page: "sampleviewing",
                type: `sample_viewing_${status}`,
                description: `Sample session updated to "${status}". Products: ${productSummary}.`
            });
            // notify client
            // const buyer = await Buyer.findById(session.buyer_id)
            // sendSMS({
            //   to: buyer?.phone,
            //   message: `Sample "${status}" by ${the_user?.name}. Products: ${productSummary}.`
            // })
        }
        catch (activityError) {
            console.error('Error creating activity:', activityError);
            // Don't fail the request if activity logging fails
        }
        res.status(200).json({
            message: `Session status updated to ${status} successfully`,
            session: await SampleViewingClients_1.default.findById(sessionId).populate("buyer_id")
        });
    }
    catch (err) {
        console.error('Error updating session status:', err);
        res.status(500).json({ error: 'Failed to update session status', details: err.message });
    }
});
exports.default = router;
