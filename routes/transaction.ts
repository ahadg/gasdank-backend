import { Router, Request, Response } from 'express';
import Transaction from '../models/Transaction';
import TransactionItem from '../models/TransactionItem';
import TransactionPayment from '../models/TransactionPayment';
import Inventory from '../models/Inventory';
import Buyer from '../models/Buyer';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  // Expected payload:
  // {
  //   user_id: string,
  //   buyer_id: string,
  //   payment: number,
  //   notes?: string,
  //   type?: "purchase" | "return" | "payment",
  //   // For purchase/return:
  //   items?: [{
  //      inventory_id: string,
  //      qty: number,
  //      measurement: number,  // multiplier for qty
  //      unit: string,
  //      price: number,
  //      sale_price?: number
  //   }],
  //   // For payment transactions:
  //   payment_method?: string
  // }
  const { user_id, buyer_id, items, payment, price, sale_price, profit, notes, type, payment_method } = req.body;
  console.log("req.body", req.body);
  // Default transaction type is "purchase"
  const transactionType: string = type || "purchase";

  try {
    // Create the transaction document
    const transaction = new Transaction({
      user_id,
      buyer_id,
      type: transactionType,
      notes,
      price: price, // using the 'price' field from schema
      sale_price: sale_price,
      profit: profit,
      items: [] // start with empty items array
    });
    await transaction.save();

    if (transactionType === "payment") {
      // For payment type, create a TransactionPayment record instead of items
      const transactionPayment = new TransactionPayment({
        transaction_id: transaction._id,
        buyer_id,
        amount_paid: payment,
        payment_method: payment_method || "unspecified",
        payment_date: new Date(),
      });
      await transactionPayment.save();
      // Increase buyer's currentBalance by payment amount
      await Buyer.findByIdAndUpdate(buyer_id, { $inc: { currentBalance: payment } });

      // Link the TransactionPayment record to the transaction
      transaction.transactionpayment_id = transactionPayment._id;
      await transaction.save();
    } else {
      // For purchase and return, process each transaction item.
      // For purchase: inventory decreases; for return: inventory increases.
      const transactionItemIds: { transactionitem_id: any }[] = [];

      for (const item of items) {
        // For purchase, check inventory availability.
        if (transactionType === "purchase") {
          const inventoryItem = await Inventory.findById(item.inventory_id);
          if (!inventoryItem) {
            return res.status(404).json({ error: `Inventory item ${item.inventory_id} not found` });
          }
          // Calculate the required quantity based on quantity and measurement multiplier.
          const requiredQty = item.qty * item.measurement;
          if (inventoryItem.qty < requiredQty) {
            return res.status(400).json({ 
              error: `Insufficient inventory for product ${inventoryItem.name}. Available: ${inventoryItem.qty}, Required: ${requiredQty}` 
            });
          }
        }
        
        // Create the transaction item record.
        const transactionItem = new TransactionItem({
          transaction_id: transaction._id,
          inventory_id: item.inventory_id,
          user_id,
          buyer_id,
          qty: item.qty,
          measurement: item.measurement,
          unit: item.unit,
          price: item.price,
          sale_price: item.sale_price,
        });
        await transactionItem.save();

        // Collect the TransactionItem _id.
        transactionItemIds.push({ transactionitem_id: transactionItem._id });
        console.log("transactionType", transactionType);
        // Determine inventory change: negative for purchase, positive for return.
        const qtyChange = (transactionType === "return") ? (item.qty * item.measurement) : -(item.qty * item.measurement);
        console.log("qtyChange", qtyChange);
        
        // Update buyer's currentBalance accordingly.
        if (transactionType === "purchase") {
          await Buyer.findByIdAndUpdate(buyer_id, { $inc: { currentBalance: -(item.sale_price * item.measurement * item.qty) } });
        } else if (transactionType === "return") {
          await Buyer.findByIdAndUpdate(buyer_id, { $inc: { currentBalance: (price * item.measurement * item.qty) } });
        }
        // Update the inventory quantity.
        await Inventory.findByIdAndUpdate(item.inventory_id, { $inc: { qty: qtyChange } });
      }

      // Update the transaction document with the list of transaction item IDs.
      transaction.items = transactionItemIds;
      await transaction.save();
    }

    res.status(201).json({ message: 'Transaction processed', transaction_id: transaction._id });
  } catch (error: any) {
    console.error('error', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/history/:buyer_id/:user_id', async (req: Request, res: Response) => {
  try {
    const { buyer_id,user_id } = req.params;
    // Build a query condition based on provided parameters
    const query: any = {};
    if (buyer_id) {
      query.buyer_id = buyer_id;
    }
    if (user_id) {
      query.user_id = user_id;
    }

    // Fetch transactions that match the query
    const transactions = await Transaction.find(query)
    .populate({
      path: 'items',
      populate: {
        path: 'transactionitem_id',
        model: 'TransactionItem',
        populate: {
          path: 'inventory_id', // The id field inside TransactionItem that you want to populate
          model: 'Inventory'  // The corresponding model for the nested field
        }
      }
    })
    .populate({
      path: 'transactionpayment_id',
      model: 'TransactionPayment'
    });
  

    res.status(200).json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/itemshistory/:buyer_id/:inventory_id', async (req: Request, res: Response) => {
  try {
    console.log("req.params;",req.params)
    const { buyer_id,inventory_id } = req.params;

    // Build a query condition based on provided parameters
    const query: any = {};
    if (buyer_id) {
      query.buyer_id = buyer_id;
    }
    if (inventory_id) {
      query.inventory_id = inventory_id;
    }

    // Fetch transactions that match the query
    const transactionsitems = await TransactionItem.find(query).populate({
      path: 'inventory_id',
      model: 'Inventory'
    }).populate({
      path: 'transaction_id',
      model: 'Transaction'
    });
    res.status(200).json(transactionsitems);
  } catch (error: any) {
    console.log("error",error)
    res.status(500).json({ error: error.message });
  }
});

export default router;
