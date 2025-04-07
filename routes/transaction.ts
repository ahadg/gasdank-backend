import { Router, Request, Response } from 'express';
import Transaction from '../models/Transaction';
import TransactionItem from '../models/TransactionItem';
import TransactionPayment from '../models/TransactionPayment';
import Inventory from '../models/Inventory';
import Buyer from '../models/Buyer';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';
import User from '../models/User';
import moment from 'moment';
import { createActivity } from './activity';


const router = Router();
router.use(authenticateJWT);



const createlogs = (user:any,obj:any) => {
  createActivity({
    user_id : user?._id, 
    user_created_by : user?.user_created_by,
    action : "create",
    resource_type : obj?.type,
    page : "transaction",
    type : obj?.type,
    amount: obj?.amount, // used for financial activity
    payment_method: obj?.payment_method, // e.g., 'credit_card', 'paypal'
    payment_direction: obj?.payment_direction,
    description : obj.description,
    transaction_id : obj?.transaction_id,
    buyer_id: obj?.buyer_id
  })
}
 const formatCurrency = (value: number) =>
    `$${value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`

router.post('/', checkAccess("sale","create"), async (req: Request, res: Response) => {
  // Expected payload:
  // {
  //   user_id: string,
  //   buyer_id: string,
  //   payment: number,
  //   notes?: string,
  //   type?: "sale" | "return" | "payment",
  //   // For sale/return:
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
  const { user_id, buyer_id, items, payment, price,total_shipping, payment_direction, sale_price, profit, notes, type, payment_method } = req.body;
  console.log("req.body", req.body);
  // Default transaction type is "sale"
  const transactionType: string = type || "sale";
  const the_user = await User.findById(user_id)
  const the_buyer = await Buyer.findById(buyer_id)

  for (const item of items || []) {
    // For sale, check inventory availability.
    if (transactionType === "sale") {
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
  }

  try {
    // Create the transaction document
    const transaction = new Transaction({
      user_id,
      buyer_id,
      type: transactionType,
      notes,
      payment_method,
      price: price || payment, // using the 'price' field from schema
      payment_direction,
      sale_price: sale_price,
      total_shipping : total_shipping,
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
        payment_direction,
        payment_method: payment_method || "unspecified",
        payment_date: new Date(),
      });
      await transactionPayment.save();
      // manage buyer's currentBalance by payment amount
      if(payment_direction === "received") {
        await Buyer.findByIdAndUpdate(buyer_id, { $inc: { currentBalance: -payment } });
      }  else {
        await Buyer.findByIdAndUpdate(buyer_id, { $inc: { currentBalance: payment } });
      }
      // manage user's currentBalance by payment amount
      if(payment_method === "Cash") {
        if(payment_direction === "received") {
          await User.findByIdAndUpdate(user_id, {$inc: { cash_balance: payment }})
        } else if(payment_direction === "given") {
          await User.findByIdAndUpdate(user_id, {$inc: { cash_balance: -payment }})
        }
      } else {
        console.log("the_user?.other_balance",the_user)
        console.log("the_user?.other_balance",the_user?.other_balance)
        if (!the_user?.other_balance?.hasOwnProperty(payment_method)) {
          // Initialize the nested key to 0 if it doesn't exist.
          await User.findByIdAndUpdate(user_id, { 
            $set: { [`other_balance.${payment_method}`]: 0 }
          });
        }
        
        if (payment_direction === "received") {
          await User.findByIdAndUpdate(user_id, { 
            $inc: { [`other_balance.${payment_method}`]: Number(payment) } 
          });
        } else if (payment_direction === "given") {
          await User.findByIdAndUpdate(user_id, { 
            $inc: { [`other_balance.${payment_method}`]: -Number(payment) } 
          });
        }
        
        
      }
      // Link the TransactionPayment record to the transaction
      transaction.transactionpayment_id = transactionPayment._id;
      await transaction.save();
      createlogs(the_user,
        {buyer_id,transaction_id : transaction?._id,type :transactionType,amount : payment_direction === "received" ? Number(payment) : -Number(payment),payment_method,payment_direction,
        description : `${payment} ${payment_method} ${payment_direction} ${payment_direction === "received" ? "from" : "to"} ${the_buyer?.firstName + " " + the_buyer?.lastName}`
      })
    } else if (transactionType === "inventory_addition") {
       // For sale: inventory decreases; for return: inventory increases.
       const transactionItemIds: { transactionitem_id: any }[] = [];
       let description = ''
       for (const item of items) {
         // Create the transaction item record.
          description += `${item.qty} ${item.unit} of ${item?.name} (@ ${formatCurrency(item.sale_price || item?.price)}) ${('+ (🚚' + " " +(formatCurrency(item.shipping * item.qty)) + ")")} \n`
         const transactionItem = new TransactionItem({
           transaction_id: transaction._id,
           inventory_id: item.inventory_id,
           user_id,
           buyer_id,
           qty: item.qty,
           measurement: item.measurement,
           shipping : item?.shipping,
           type,
           unit: item.unit,
           price: item.price,
           sale_price: item.sale_price,
         });
         await transactionItem.save();
 
         // Collect the TransactionItem _id.
         transactionItemIds.push({ transactionitem_id: transactionItem._id });
         console.log("transactionType", transactionType);

         // Update the inventory quantity.
         //await Inventory.findByIdAndUpdate(item.inventory_id, { $inc: { qty: qtyChange } });
       }
       console.log("(price + total_shipping)",(price + total_shipping))
       await Buyer.findByIdAndUpdate(buyer_id, { $inc: { currentBalance: -(price + total_shipping)  } });
 
       // Update the transaction document with the list of transaction item IDs.
       transaction.items = transactionItemIds;
       await transaction.save();
       createlogs(the_user,
        {buyer_id,type : transactionType,transaction_id : transaction?._id,amount : price + total_shipping,
        description,
      })
    } else {
      // For sale and return, process each transaction item.
      // For sale: inventory decreases; for return: inventory increases.
      const transactionItemIds: { transactionitem_id: any }[] = [];
      let description = ''
      for (const item of items) {
        // Create the transaction item record.
        description += `${item.qty} ${item.unit} of ${item?.name} (@ ${formatCurrency(item.sale_price || item?.price)}) ${('+ (🚚' + " " +(formatCurrency(item.shipping * item.qty)) + ")")} \n`
        const transactionItem = new TransactionItem({
          transaction_id: transaction._id,
          inventory_id: item.inventory_id,
          user_id,
          buyer_id,
          qty: item.qty,
          measurement: item.measurement,
          shipping : item?.shipping,
          type,
          unit: item.unit,
          price: item.price,
          sale_price: item.sale_price,
        });
        await transactionItem.save();

        // Collect the TransactionItem _id.
        transactionItemIds.push({ transactionitem_id: transactionItem._id });
        console.log("transactionType", transactionType);
        // Determine inventory change: negative for sale, positive for return.
        const qtyChange = (transactionType === "return") ? (item.qty * item.measurement) : -(item.qty * item.measurement);
        console.log("qtyChange", qtyChange);
        
        // Update buyer's currentBalance accordingly.
        if (transactionType === "sale") {
          console.log(item.sale_price * item.measurement * item.qty + item?.shipping)
          await Buyer.findByIdAndUpdate(buyer_id, { $inc: { currentBalance: (item.sale_price * item.measurement * item.qty) + (item.qty * item?.shipping ) } });
        } else if (transactionType === "return") {
          console.log(-(item.price * item.measurement * item.qty + (item.qty * item?.shipping )))
          await Buyer.findByIdAndUpdate(buyer_id, { $inc: { currentBalance: -((parseInt(item.price) * parseInt(item.measurement)) * item.qty + (parseInt(item.qty) * parseInt(item?.shipping ))) } });
        }
        // Update the inventory quantity.
        await Inventory.findByIdAndUpdate(item.inventory_id, { $inc: { qty: qtyChange } });
      }

      // Update the transaction document with the list of transaction item IDs.
      transaction.items = transactionItemIds;
      await transaction.save();
      createlogs(the_user,
        {
          transaction_id : transaction._id,
          buyer_id,
          type : transactionType,amount : transactionType === "sale" ? parseInt(sale_price + total_shipping) : -parseInt(price + total_shipping),
          description 
      })
    }

    res.status(201).json({ message: 'Transaction processed', transaction_id: transaction._id });
  } catch (error: any) {
    console.error('error', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/history/:buyer_id/:user_id', checkAccess("wholesale", "read"), async (req: Request, res: Response) => {
  try {
    const { buyer_id, user_id } = req.params;

    // Get the start and end of today (12:00 AM - 11:59 PM)
    const todayStart = moment().startOf('day').toDate(); // Today at 12:00 AM
    const todayEnd = moment().endOf('day').toDate(); // Today at 11:59:59 PM

    // Build a query condition based on provided parameters
    const query: any = {
      created_at: { $gte: todayStart, $lt: todayEnd } // Fetch today's transactions only
    };


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
            path: 'inventory_id',
            model: 'Inventory'
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


router.get('/itemshistory/:buyer_id/:inventory_id',checkAccess("sale","read"), async (req: Request, res: Response) => {
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

// recent tranaction
router.get('/recent/:buyer_id/:inventory_id', checkAccess("sale", "read"), async (req: Request, res: Response) => {
  try {
    console.log("req.params:", req.params);
    const { buyer_id, inventory_id } = req.params;

    // Build a query condition based on provided parameters.
    const query: any = {};
    if (buyer_id) {
      query.buyer_id = buyer_id;
    }
    if (inventory_id) {
      query.inventory_id = inventory_id;
      query.type = "sale"
    }

    const buyer = await Buyer.findById(buyer_id)

    // Fetch the most recent transaction item matching the query.
    const recentTransactionItem = await TransactionItem.findOne(query)
      .sort({ created_at: -1 }) // Sort descending by creation time
      .populate({
        path: 'inventory_id',
        model: 'Inventory'
      })
      .populate({
        path: 'transaction_id',
        model: 'Transaction'
      });

    res.status(200).json({recentTransactionItem,buyer});
  } catch (error: any) {
    console.log("error", error);
    res.status(500).json({ error: error.message });
  }
});


export default router;
