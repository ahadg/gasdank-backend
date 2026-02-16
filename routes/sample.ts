import { Router, Request, Response } from 'express';
import { authenticateJWT } from "../middlewares/authMiddleware";
import checkAccess from "../middlewares/accessMiddleware";
import Notification from "../models/notification";
import Sample from '../models/Sample';
import Inventory, { generateProductId } from '../models/Inventory';
import mongoose from 'mongoose';
import User from '../models/User';
import Buyer from '../models/Buyer';
import { formatPhoneNumber, twilioClient } from './notifications';
import { createlogs, formatCurrency } from './transaction';
import TransactionItem from '../models/TransactionItem';
import Transaction from '../models/Transaction';
import notification from '../models/notification';


const router = Router();

router.use(authenticateJWT);

// GET /api/samples?user_id=xxx — Get all samples for a user
router.get("/", async (req: Request, res: Response) => {
  const { user_id, status } = req.query;

  if (!user_id || !mongoose.Types.ObjectId.isValid(user_id as string)) {
    return res.status(400).json({ error: "Invalid or missing user_id" });
  }

  try {
    const user: any = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let userIds: mongoose.Types.ObjectId[] = [
      new mongoose.Types.ObjectId(String(user_id)),
    ];

    if (user.role === "admin" || user.role === "superadmin") {
      // if admin → include all created users
      const createdUsers = await User.find(
        { created_by: user._id },
        { _id: 1 }
      ).lean();
      const createdUserIds = createdUsers.map((u) => u._id);
      userIds = [user._id, ...createdUserIds];
    } else if (user.created_by) {
      // if normal user → include self + their admin
      userIds = [user._id, user.created_by];
    }

    let samples;
    if (status === "history") {
      samples = await Sample.find({ user_id: { $in: userIds }, status: { $in: ["accepted", "returned", "processed"] } })
        .populate("buyer_id");
    } else {
      samples = await Sample.find({
        user_id: { $in: userIds },
        status: { $in: ["holding", "partially_processed"] },
      }).populate("buyer_id");
    }

    res.status(200).json(samples);
  } catch (err: any) {
    console.error("Error fetching samples:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch samples", details: err.message });
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
    const user: any = await User.findById(user_id);
    const transaction = new Transaction({
      user_id: (user?.role == "admin" || user?.role == "superadmin") ? user_id : user.created_by,
      buyer_id: buyer_id,
      worker_id: user?.role == "user" ? user_id : null, // fallback to user_id if no worker_id
      type: "sample_recieved",
      notes: `Sample Recieved `,
      payment_method: "Credit", // or whatever default you prefer
      price: 0, // will be calculated from products
      payment_direction: "given", // since we're adding to buyer's debt
      total_shipping: 0,
      profit: 0,
      sample_id: newSample?._id,
      items: [] // start with empty items array
    });

    let totalPrice = 0;
    let totalPriceWithShipping = 0;
    let totalShipping = 0;
    let description = '';

    for (const product of products) {
      const qty = Number(product.qty) || 0;
      const price = Number(product.price) || 0;
      const shipping_per_unit = Number(product.shippingCost) || 0;
      const measurement = Number(product.measurement) || 1;
      const multiplier = product.unit === 'per piece' ? 1 : measurement;

      const productTotalPrice = price * qty * multiplier;
      const productTotalShipping = Number(shipping_per_unit * qty).toFixed(2);
      const displayUnit = product.unit === 'per piece' ? 'pcs' : (product.unit === 'pounds' ? 'lbs' : (product.unit === 'gram' ? 'g' : (product.unit === 'kg' ? 'kg' : product.unit)));

      // Build description string
      const refText = product.reference_number ? ` (Ref: ${product.reference_number})` : '';
      description += `${qty} ${displayUnit}${refText} of ${product.name} (@ ${formatCurrency(price)}) + (🚚 ${formatCurrency(Number(productTotalShipping))}) \n`;

      // Add to totals
      totalPrice += productTotalPrice;
      totalPriceWithShipping += (price * multiplier + shipping_per_unit) * qty;
      totalShipping += Number(productTotalShipping);
    }

    transaction.price = totalPrice;
    transaction.total_shipping = Number(totalShippingCost).toFixed(2);
    const roundBalance = (totalPriceWithShipping).toFixed(2);
    console.log("totalPriceWithShipping", totalPriceWithShipping)
    await Buyer.findByIdAndUpdate(buyer_id, {
      $inc: { currentBalance: -roundBalance }
    });
    await transaction.save();

    createlogs(user, {
      buyer_id: buyer_id,
      type: "sample_recieved",
      transaction_id: transaction._id,
      amount: (totalPrice),
      description: description.trim(),
    });

    res.status(201).json(newSample);
  } catch (err: any) {
    console.error('Error creating sample:', err);
    res.status(500).json({ error: 'Failed to add sample', details: err.message });
  }
});

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

router.post('/:id/accept', async (req: AuthenticatedRequest, res) => {
  try {
    const sample = await Sample.findById(req.params.id);
    console.log("req.user", req.user)
    const user = await User.findById(req.user?.id);
    //await User.findById(sample?.user_id);
    let transaction = await Transaction.find({ sample_id: req.params.id });
    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    if (sample.status === 'accepted') {
      return res.status(400).json({ error: 'Sample already accepted' });
    }

    // ============================================================================
    // CREATE TRANSACTION FOR INVENTORY ADDITION
    // ============================================================================
    const n_transaction = new Transaction({
      user_id: (user?.role == "admin" || user?.role == "superadmin") ? sample.user_id : req.user?.id,
      buyer_id: sample.buyer_id,
      worker_id: user?.role == "user" ? sample.user_id : null, // fallback to user_id if no worker_id
      type: "inventory_addition",
      notes: `Inventory addition from accepted sample`,
      payment_method: "Credit", // or whatever default you prefer
      price: 0, // will be calculated from products
      payment_direction: "given", // since we're adding to buyer's debt
      total_shipping: 0,
      profit: 0,
      sample_id: sample?._id,
      items: [] // start with empty items array
    });

    await n_transaction.save();
    console.log("step _ 1")
    // ============================================================================
    // PROCESS SAMPLE PRODUCTS AND CREATE INVENTORY
    // ============================================================================
    const transactionItemIds = [];
    let totalPrice = 0;
    let totalPriceWithShipping = 0;
    let totalShipping = 0;
    let description = '';

    const productsToProcess = sample.products.filter((p: any) => p.status === 'holding');

    for (const product of productsToProcess) {
      const qty = Number(product.qty) || 0;
      const price = Number(product.price) || 0;
      const shipping_per_unit = Number(product.shippingCost) || 0;
      const measurement = Number(product.measurement) || 1;
      const multiplier = product.unit === 'per piece' ? 1 : measurement;

      const productTotalPrice = price * qty * multiplier;
      const productTotalShipping = Number(shipping_per_unit * qty).toFixed(2);
      const displayUnit = product.unit === 'per piece' ? 'pcs' : (product.unit === 'pounds' ? 'lbs' : (product.unit === 'gram' ? 'g' : (product.unit === 'kg' ? 'kg' : product.unit)));

      // Create inventory item
      const inventoryItem = await Inventory.create({
        name: product.name,
        qty: qty * multiplier,
        unit: product.unit,
        user_id: sample.user_id,
        user_created_by_id: user?.created_by,
        buyer_id: sample.buyer_id,
        category: product.category_id,
        price: price,
        shippingCost: shipping_per_unit.toFixed(2),
        product_id: generateProductId(),
        reference_number: product.reference_number,
        product_type: product.product_type
      });

      // Create transaction item record
      const transactionItem = new TransactionItem({
        transaction_id: n_transaction._id,
        inventory_id: inventoryItem._id,
        user_id: sample.user_id,
        buyer_id: sample.buyer_id,
        qty: qty,
        measurement: measurement,
        shipping: shipping_per_unit,
        type: "sample_addition",
        unit: product.unit,
        price: price,
        sale_price: price,
      });

      await transactionItem.save();

      // Collect the TransactionItem _id
      transactionItemIds.push({ transactionitem_id: transactionItem._id });

      // Build description string
      const refText = product.reference_number ? ` (Ref: ${product.reference_number})` : '';
      description += `${qty} ${displayUnit}${refText} of ${product.name} (@ ${formatCurrency(price)}) + (🚚 ${formatCurrency(Number(productTotalShipping))}) \n`;

      // Add to totals
      totalPrice += productTotalPrice;
      totalPriceWithShipping += (price * multiplier + shipping_per_unit) * qty;
      totalShipping += Number(productTotalShipping);

      // Mark product as accepted
      product.status = 'accepted';
    }
    // create notification
    //notification
    // ============================================================================
    // UPDATE TRANSACTION WITH CALCULATED VALUES
    // ============================================================================
    const roundBalance = (totalPriceWithShipping).toFixed(2);

    n_transaction.price = totalPrice;
    n_transaction.total_shipping = Number(sample?.totalShippingCost).toFixed(2);
    n_transaction.items = transactionItemIds;
    await n_transaction.save();
    await Transaction.findOneAndUpdate({
      sample_id: req.params.id,
      //  worker_id: req.user?.id 
    }, { items: transactionItemIds });

    // // ============================================================================
    // // UPDATE BUYER BALANCE
    // // ============================================================================
    // await Buyer.findByIdAndUpdate(sample.buyer_id, { 
    //   $inc: { currentBalance: -roundBalance } 
    // });

    // ============================================================================
    // CREATE LOGS
    // ============================================================================
    const the_user = await User.findById(req.user?.id);
    createlogs(the_user, {
      buyer_id: sample.buyer_id,
      type: "sample_inventory_addition",
      transaction_id: transaction[0]._id,
      amount: (totalPriceWithShipping),
      description: description.trim(),
    });

    // ============================================================================
    // UPDATE SAMPLE STATUS
    // ============================================================================
    const allProcessed = sample.products.every((p: any) => p.status !== 'holding');
    if (allProcessed) {
      // If all products were accepted in this bulk call or previously
      const allAccepted = sample.products.every((p: any) => p.status === 'accepted');
      sample.status = allAccepted ? 'accepted' : 'processed';
    } else {
      sample.status = 'partially_processed';
    }
    sample.transaction_id = transaction[0]._id; // Link sample to transaction if your schema supports it
    await sample.save();

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    res.status(200).json({
      message: 'Sample accepted and inventory created successfully',
      //transaction_id: transaction._id,
      sample_id: sample._id,
      inventory_items_created: sample.products.length,
      //total_amount: roundBalance
    });

  } catch (error) {
    console.error('Error accepting sample:', error);
    res.status(500).json({ error: error });
  }
});

// POST /api/samples/:id/return
router.post('/:id/return', async (req, res) => {
  const sample = await Sample.findById(req.params.id)
  const prev_transaction = await Transaction.find({ sample_id: req.params.id })
  if (!sample) return res.status(404).json({ error: 'Sample not found' })

  const buyer = await Buyer.findById(sample?.buyer_id)

  const productsToReturn = sample.products.filter((p: any) => p.status === 'holding');

  // Create detailed product list for SMS
  const productList = productsToReturn.map((product: any) => {
    const displayUnit = product.unit === 'per piece' ? 'pcs' : (product.unit === 'pounds' ? 'lbs' : (product.unit === 'gram' ? 'g' : (product.unit === 'kg' ? 'kg' : product.unit)));
    const refText = product.reference_number ? ` [Ref: ${product.reference_number}]` : '';
    return `${product.name}${refText} (${product.qty} ${displayUnit})`
  }).join(', ')

  console.log("prev_transaction", req.params.id, prev_transaction)
  const user = await User.findById(sample?.user_id);

  const priceWithShipping = productsToReturn.reduce((sum: any, product: any) => {
    const multiplier = product.unit === 'per piece' ? 1 : (Number(product.measurement) || 1);
    const itemTotal = (product.shippingCost + product.price * multiplier) * product.qty;

    // Mark product as returned
    product.status = 'returned';

    return sum + itemTotal;
  }, 0)

  const transaction = new Transaction({
    user_id: prev_transaction?.[0]?.user_id,
    buyer_id: prev_transaction?.[0]?.buyer_id,
    worker_id: prev_transaction?.[0]?.worker_id,
    sample_id: prev_transaction?.[0]?.sample_id,
    payment_direction: prev_transaction?.[0]?.payment_direction,
    price: productsToReturn.reduce((s: number, p: any) => s + (p.price * p.qty * (p.unit === 'per piece' ? 1 : Number(p.measurement))), 0),
    total_shipping: productsToReturn.reduce((s: number, p: any) => s + (p.shippingCost * p.qty), 0).toFixed(2),
    profit: prev_transaction?.[0]?.profit,
    type: "sample_returned",
    notes: `Sample Returned `,
    payment_method: "Debit",
  });

  await Buyer.findByIdAndUpdate(prev_transaction?.[0]?.buyer_id, {
    $inc: { currentBalance: priceWithShipping }
  });

  await transaction.save()
  createlogs(user, {
    buyer_id: sample?.buyer_id,
    type: "sample_return",
    transaction_id: transaction._id,
    amount: priceWithShipping,
    description: productList,
  });

  // Calculate total quantity and items
  const totalItems = productsToReturn.length
  const totalQty = productsToReturn.reduce((sum: number, product: any) => sum + product.qty, 0)

  const allProcessed = sample.products.every((p: any) => p.status !== 'holding');
  if (allProcessed) {
    const allReturned = sample.products.every((p: any) => p.status === 'returned');
    sample.status = allReturned ? 'returned' : 'processed';
  } else {
    sample.status = 'partially_processed';
  }

  await sample.save()
  // Create comprehensive SMS message
  let smsBody = `Hi! Your sample order has been returned.\n\nProducts: ${productList}`

  if (totalItems > 1) {
    smsBody += `\n\nTotal: ${totalItems} items (${totalQty} units)`
  }

  smsBody += `\n\nPlease contact us if you have any questions.`
  try {
    const smsResult = await twilioClient.messages.create({
      body: smsBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formatPhoneNumber(buyer.phone)
    });

  } catch (error) {
    console.log('error', error)
  }



  res.status(200).json({ message: 'Returned' })
})

// POST /api/samples/:id/product/:productId/accept
router.post('/:id/product/:productId/accept', async (req: AuthenticatedRequest, res) => {
  try {
    const { id, productId } = req.params;
    const sample = await Sample.findById(id);
    const user = await User.findById(req.user?.id);

    if (!sample) return res.status(404).json({ error: 'Sample not found' });

    const product = sample.products.find((p: any) => p._id.toString() === productId);
    if (!product) return res.status(404).json({ error: 'Product not found in sample' });
    if (product.status !== 'holding') return res.status(400).json({ error: 'Product already processed' });

    // Create inventory item
    const qty = Number(product.qty) || 0;
    const price = Number(product.price) || 0;
    const shipping_per_unit = Number(product.shippingCost) || 0;
    const measurement = Number(product.measurement) || 1;
    const multiplier = product.unit === 'per piece' ? 1 : measurement;

    const inventoryItem = await Inventory.create({
      name: product.name,
      qty: qty * multiplier,
      unit: product.unit,
      user_id: sample.user_id,
      user_created_by_id: user?.created_by,
      buyer_id: sample.buyer_id,
      category: product.category_id,
      price: price,
      shippingCost: shipping_per_unit.toFixed(2),
      product_id: generateProductId(),
      reference_number: product.reference_number,
      product_type: product.product_type
    });

    // Handle transaction logic (simplified for single product)
    const n_transaction = new Transaction({
      user_id: (user?.role == "admin" || user?.role == "superadmin") ? sample.user_id : req.user?.id,
      buyer_id: sample.buyer_id,
      worker_id: user?.role == "user" ? sample.user_id : null,
      type: "inventory_addition",
      notes: `Inventory addition from accepted sample product: ${product.name}`,
      payment_method: "Credit",
      price: price * qty * multiplier,
      total_shipping: (shipping_per_unit * qty).toFixed(2),
      payment_direction: "given",
      sample_id: sample._id,
      items: []
    });
    await n_transaction.save();

    const transactionItem = new TransactionItem({
      transaction_id: n_transaction._id,
      inventory_id: inventoryItem._id,
      user_id: sample.user_id,
      buyer_id: sample.buyer_id,
      qty: qty,
      measurement: measurement,
      shipping: shipping_per_unit,
      type: "sample_addition",
      unit: product.unit,
      price: price,
      sale_price: price,
    });
    await transactionItem.save();

    n_transaction.items = [{ transactionitem_id: transactionItem._id }];
    await n_transaction.save();

    // Update product status
    product.status = 'accepted';

    // Check if all products processed
    const allProcessed = sample.products.every((p: any) => p.status !== 'holding');
    if (allProcessed) {
      sample.status = 'processed'; // or 'accepted' if all were accepted
    } else {
      sample.status = 'partially_processed';
    }

    await sample.save();

    res.status(200).json({ message: 'Product accepted and moved to inventory' });
  } catch (error: any) {
    console.error('Error accepting product:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/samples/:id/product/:productId/return
router.post('/:id/product/:productId/return', async (req: AuthenticatedRequest, res) => {
  try {
    const { id, productId } = req.params;
    const sample = await Sample.findById(id);
    const user = await User.findById(req.user?.id);

    if (!sample) return res.status(404).json({ error: 'Sample not found' });

    const product = sample.products.find((p: any) => p._id.toString() === productId);
    if (!product) return res.status(404).json({ error: 'Product not found in sample' });
    if (product.status !== 'holding') return res.status(400).json({ error: 'Product already processed' });

    const multiplier = product.unit === 'per piece' ? 1 : (Number(product.measurement) || 1);
    const priceWithShipping = (product.shippingCost + product.price * multiplier) * product.qty;

    // Refund buyer
    await Buyer.findByIdAndUpdate(sample.buyer_id, {
      $inc: { currentBalance: priceWithShipping }
    });

    // Create return transaction
    const transaction = new Transaction({
      user_id: sample.user_id,
      buyer_id: sample.buyer_id,
      sample_id: sample._id,
      type: "sample_returned",
      notes: `Sample product returned: ${product.name}`,
      payment_method: "Debit",
      price: product.price * product.qty * multiplier,
      total_shipping: (product.shippingCost * product.qty).toFixed(2),
    });
    await transaction.save();

    // Update product status
    product.status = 'returned';

    // Check if all products processed
    const allProcessed = sample.products.every((p: any) => p.status !== 'holding');
    if (allProcessed) {
      sample.status = 'processed';
    } else {
      sample.status = 'partially_processed';
    }

    await sample.save();

    res.status(200).json({ message: 'Product returned' });
  } catch (error: any) {
    console.error('Error returning product:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;