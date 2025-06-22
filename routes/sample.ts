import { Router, Request, Response } from 'express';
import { authenticateJWT } from "../middlewares/authMiddleware";
import checkAccess from "../middlewares/accessMiddleware";
import Notification from "../models/notification";
import Sample from '../models/Sample';
import Inventory, { generateProductId } from '../models/Inventory';
import mongoose from 'mongoose';
import User from '../models/User';
import Buyer from '../models/Buyer';
import { twilioClient } from './notifications';
import { createlogs, formatCurrency } from './transaction';
import TransactionItem from '../models/TransactionItem';
import Transaction from '../models/Transaction';
import notification from '../models/notification';


const router = Router();

// Optionally protect all /api/users endpoints
router.use(authenticateJWT);

// GET /api/samples?user_id=xxx — Get all samples for a user
router.get('/', async (req: Request, res: Response) => {
  const { user_id,status } = req.query;

  if (!user_id || !mongoose.Types.ObjectId.isValid(user_id as string)) {
    return res.status(400).json({ error: 'Invalid or missing user_id' });
  }

  try {
    let samples
    if(status == "history") {
      samples = await Sample.find({ user_id }).populate("buyer_id");
    } else {
      samples = await Sample.find({ user_id, status : "holding" }).populate("buyer_id");
    }
   
    res.status(200).json(samples);
  } catch (err: any) {
    console.error('Error fetching samples:', err);
    res.status(500).json({ error: 'Failed to fetch samples', details: err.message });
  }
});


router.post('/', async (req: Request, res: Response) => {
  try {
    const { user_id, buyer_id, status = 'holding', products, totalShippingCost } = req.body;
    console.log("req.body;", req.body);

    if (!mongoose.Types.ObjectId.isValid(user_id) || !mongoose.Types.ObjectId.isValid(buyer_id)) {
      return res.status(400).json({ error: 'Invalid user_id or buyer_id' });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products must be a non-empty array' });
    }

    // Create the new sample
    const newSample = new Sample({
      user_id,
      buyer_id,
      status,
      products,
      totalShippingCost
    });

    await newSample.save();

    // Create notification for the buyer
    // try {
    //   const notification = new Notification({
    //     user_id: buyer_id, // recipient (buyer)
    //     actorId: user_id,  // person who triggered it (seller/user)
    //     type: 'sample_created',
    //     message: `A new sample with ${products.length} product${products.length > 1 ? 's' : ''} has been sent to you`,
    //     activityId: newSample._id, // reference to the sample
    //     isRead: false
    //   });

    //   await notification.save();
    //   console.log('Notification created successfully for buyer:', buyer_id);
    // } catch (notificationError) {
    //   console.error('Error creating notification:', notificationError);
    //   // Don't fail the entire request if notification fails
    // }

    res.status(201).json(newSample);
  } catch (err: any) {
    console.error('Error creating sample:', err);
    res.status(500).json({ error: 'Failed to add sample', details: err.message });
  }
});


router.post('/:id/accept', async (req, res) => {
  try {
    const sample = await Sample.findById(req.params.id);
    const user = await User.findById(sample?.user_id);
    
    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }
    
    if (sample.status === 'accepted') {
      return res.status(400).json({ error: 'Sample already accepted' });
    }

    // ============================================================================
    // CREATE TRANSACTION FOR INVENTORY ADDITION
    // ============================================================================
    const transaction = new Transaction({
      user_id: (user?.role == "admin" || user?.role == "superadmin") ? sample.user_id : sample.created_by ,
      buyer_id: sample.buyer_id,
      worker_id: user?.role == "user"  ? sample.user_id : null, // fallback to user_id if no worker_id
      type: "inventory_addition",
      notes: `Inventory addition from accepted sample`,
      payment_method: "Credit", // or whatever default you prefer
      price: 0, // will be calculated from products
      payment_direction: "given", // since we're adding to buyer's debt
      total_shipping: 0,
      profit: 0,
      items: [] // start with empty items array
    });

    //await transaction.save();
    console.log("step _ 1")
    // ============================================================================
    // PROCESS SAMPLE PRODUCTS AND CREATE INVENTORY
    // ============================================================================
    const transactionItemIds = [];
    let totalPrice = 0;
    let totalPriceWithShipping = 0;
    let totalShipping = 0;
    let description = '';

    for (const product of sample.products) {
      const shipping_per_unit = product.shippingCost
      // console.log({
      //   shippingCost: product.shippingCost,
      //   shippingPerUnit: product?.shippingPerUnit
      // })
      console.log("shipping_per_unit",shipping_per_unit)
      const productTotalPrice = product.price * product.qty;
      let productTotalShipping = Number(product.shippingCost).toFixed(2);
      
      // Create inventory item
      const inventoryItem = await Inventory.create({
        name: product.name,
        qty: product.qty,
        unit: product.unit,
        user_id: sample.user_id,
        user_created_by_id: user?.created_by,
        buyer_id: sample.buyer_id,
        category: product.category_id,
        price: product.price,
        shippingCost: Number(shipping_per_unit).toFixed(2),
        product_id: generateProductId()
      });

      // Create transaction item record
      const transactionItem = new TransactionItem({
        transaction_id: transaction._id,
        inventory_id: inventoryItem._id,
        user_id: sample.user_id,
        buyer_id: sample.buyer_id,
        qty: product.qty,
        measurement: 1, // assuming 1:1 measurement for samples
        shipping: shipping_per_unit,
        type: "inventory_addition",
        unit: product.unit,
        price: product.price,
        sale_price: product.price, // assuming sale_price equals price for samples
      });
      
      await transactionItem.save();
      
      // Collect the TransactionItem _id
      transactionItemIds.push({ transactionitem_id: transactionItem._id });
      
      // Build description string
      description += `${product.qty} ${product.unit} of ${product.name} (@ ${formatCurrency(product.price)}) + (🚚 ${formatCurrency(Number(productTotalShipping))}) \n`;
      
      // Add to totals
      totalPrice += productTotalPrice;
      totalPriceWithShipping += (product.price + product.shippingCost) * product.qty;
      totalShipping +=  Number(productTotalShipping);
    }
    // create notification
    //notification
    // ============================================================================
    // UPDATE TRANSACTION WITH CALCULATED VALUES
    // ============================================================================
    const roundBalance = (totalPriceWithShipping).toFixed(2);
    
    transaction.price = totalPrice;
    transaction.total_shipping = Number(sample?.totalShippingCost).toFixed(2);
    transaction.items = transactionItemIds;
    await transaction.save();

    // ============================================================================
    // UPDATE BUYER BALANCE
    // ============================================================================
    await Buyer.findByIdAndUpdate(sample.buyer_id, { 
      $inc: { currentBalance: -roundBalance } 
    });

    // ============================================================================
    // CREATE LOGS
    // ============================================================================
    createlogs(user, {
      buyer_id: sample.buyer_id,
      type: "inventory_addition",
      transaction_id: transaction._id,
      amount: parseFloat(roundBalance),
      description: description.trim(),
    });

    // ============================================================================
    // UPDATE SAMPLE STATUS
    // ============================================================================
    sample.status = 'accepted';
    sample.transaction_id = transaction._id; // Link sample to transaction if your schema supports it
    await sample.save();

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    res.status(200).json({ 
      message: 'Sample accepted and inventory created successfully',
      transaction_id: transaction._id,
      sample_id: sample._id,
      inventory_items_created: sample.products.length,
      total_amount: roundBalance
    });

  } catch (error) {
    console.error('Error accepting sample:', error);
    res.status(500).json({ error: error });
  }
});

// POST /api/samples/:id/return
router.post('/:id/return', async (req, res) => {
  const sample = await Sample.findById(req.params.id)
  if (!sample) return res.status(404).json({ error: 'Sample not found' })
   
  const buyer = await Buyer.findById(sample?.buyer_id)
  
  // Create detailed product list for SMS
  const productList = sample.products.map((product: any) => {
    return `${product.name} (${product.qty} ${product.unit})`
  }).join(', ')
  
  // Calculate total quantity and items
  const totalItems = sample.products.length
  const totalQty = sample.products.reduce((sum: number, product: any) => sum + product.qty, 0)
  
  // Create comprehensive SMS message
  let smsBody = `Hi! Your sample order has been returned.\n\nProducts: ${productList}`
  
  if (totalItems > 1) {
    smsBody += `\n\nTotal: ${totalItems} items (${totalQty} units)`
  }
  
  smsBody += `\n\nPlease contact us if you have any questions.`
  
  const smsResult = await twilioClient.messages.create({
    body: smsBody,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: buyer.phone
  });
   
  sample.status = 'returned'
  await sample.save()
   
  res.status(200).json({ message: 'Returned' })
})
  

  export default router;