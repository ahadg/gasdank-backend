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
      samples = await Sample.find({ user_id: { $in: userIds } })
        .populate("buyer_id");
    } else {
      samples = await Sample.find({
        user_id: { $in: userIds },
        status: "holding",
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
      const shipping_per_unit = product.shippingCost
      // console.log({
      //   shippingCost: product.shippingCost,
      //   shippingPerUnit: product?.shippingPerUnit
      // })
      console.log("shipping_per_unit", shipping_per_unit)
      const productTotalPrice = product.price * product.qty;
      let productTotalShipping = Number(product.shippingCost).toFixed(2);

      // Build description string
      description += `${product.qty} ${product.unit} of ${product.name} (@ ${formatCurrency(product.price)}) + (🚚 ${formatCurrency(Number(productTotalShipping))}) \n`;

      // Add to totals
      totalPrice += productTotalPrice;
      totalPriceWithShipping += (Number(product.price) + product.shippingCost) * product.qty;
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

    for (const product of sample.products) {
      const shipping_per_unit = product.shippingCost
      // console.log({
      //   shippingCost: product.shippingCost,
      //   shippingPerUnit: product?.shippingPerUnit
      // })
      console.log("shipping_per_unit", shipping_per_unit)
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
        transaction_id: transaction[0]._id,
        inventory_id: inventoryItem._id,
        user_id: sample.user_id,
        buyer_id: sample.buyer_id,
        qty: product.qty,
        measurement: 1, // assuming 1:1 measurement for samples
        shipping: shipping_per_unit,
        type: "sample_addition",
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
      totalShipping += Number(productTotalShipping);
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
    sample.status = 'accepted';
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

  // Create detailed product list for SMS
  const productList = sample.products.map((product: any) => {
    return `${product.name} (${product.qty} ${product.unit})`
  }).join(', ')
  // {
  //   _id: new ObjectId("685fd223a92f28d9d4481d4b"),
  //   user_id: new ObjectId("6818fce5b2ca3e2d8df7e158"),
  //   buyer_id: new ObjectId("68544f4c20aef3c79d03db44"),
  //   worker_id: null,
  //   sample_id: new ObjectId("685fd222a92f28d9d4481d47"),
  //   payment_direction: 'given',
  //   payment_method: 'Credit',
  //   type: 'sample_recieved',
  //   notes: 'Sample Recieved ',
  //   price: 40,
  //   total_shipping: 10,
  //   profit: 0,
  //   items: [],
  //   edited: false,
  //   created_at: 2025-06-28T11:29:39.256Z,
  //   updated_at: 2025-06-28T11:29:39.256Z,
  //   prevValues: [],
  //   __v: 0
  // }
  console.log("prev_transaction", req.params.id, prev_transaction)
  const user = await User.findById(sample?.user_id);

  const transaction = new Transaction({
    user_id: prev_transaction?.[0]?.user_id,
    buyer_id: prev_transaction?.[0]?.buyer_id,
    worker_id: prev_transaction?.[0]?.worker_id,
    sample_id: prev_transaction?.[0]?.sample_id,
    payment_direction: prev_transaction?.[0]?.payment_direction,
    price: prev_transaction?.[0]?.price,
    total_shipping: prev_transaction?.[0]?.total_shipping,
    profit: prev_transaction?.[0]?.profit,
    type: "sample_returned",
    notes: `Sample Returned `,
    payment_method: "Debit", // or whatever default you prefer
  });
  const priceWithShipping = sample?.products?.reduce((sum: any, product: any) => sum + (product.shippingCost + product?.price) * product.qty, 0)
  await Buyer.findByIdAndUpdate(prev_transaction?.[0]?.buyer_id, {
    $inc: { currentBalance: priceWithShipping }
  });

  await transaction.save()
  createlogs(user, {
    buyer_id: sample?.buyer_id,
    type: "sample_return",
    transaction_id: transaction._id,
    amount: (prev_transaction[0]?.price),
    description: productList,
  });


  // Calculate total quantity and items
  const totalItems = sample.products.length
  const totalQty = sample.products.reduce((sum: number, product: any) => sum + product.qty, 0)
  sample.status = 'returned'
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


export default router;