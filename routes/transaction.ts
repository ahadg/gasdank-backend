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



export const createlogs = (user:any,obj:any) => {
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
 export const formatCurrency = (value: number) =>
    `$${value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`




// GET /api/transaction/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { populate } = req.query;
    
    let query = Transaction.findById(id)
      .populate('user_id', 'firstName lastName email')
      .populate('buyer_id', 'firstName lastName email')
      .populate('transactionpayment_id')
      .populate({
        path: 'items.transactionitem_id',
        populate: {
          path: 'inventory_id',
          model: 'Inventory'
        }
      });

    // If populate=prevValues is requested, populate the references within prevValues
    if (populate && typeof populate === 'string' && populate.includes('prevValues')) {
      query = query.populate([
        {
          path: 'prevValues.original_items.transactionitem_id',
          model: 'TransactionItem'
        },
        {
          path: 'prevValues.original_items.inventory_id',
          model: 'Inventory'
        },
        {
          path: 'prevValues.items.transactionitem_id',
          model: 'TransactionItem'
        },
        {
          path: 'prevValues.items.inventory_id',
          model: 'Inventory'
        }
      ]);
    }

    const transaction = await query.exec();
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.status(200).json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



router.post('/', checkAccess("sale", "create"), async (req: Request, res: Response) => {
  // Expected payload structure:
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

  // Extract data from request body
  const { 
    user_id, 
    worker_id, 
    buyer_id, 
    items, 
    payment, 
    price, 
    total_shipping, 
    payment_direction, 
    sale_price, 
    profit, 
    notes, 
    type, 
    payment_method 
  } = req.body;

  console.log("req.body", req.body);

  // Default transaction type is "sale"
  const transactionType: string = type || "sale";
  
  // Fetch user and buyer data
  const the_user = await User.findById(user_id);
  const the_buyer = await Buyer.findById(buyer_id);

  // ============================================================================
  // INVENTORY VALIDATION FOR SALES
  // ============================================================================
  for (const item of items || []) {
    if (transactionType === "sale") {
      const inventoryItem = await Inventory.findById(item.inventory_id);
      
      if (!inventoryItem) {
        return res.status(404).json({ 
          error: `Inventory item ${item.inventory_id} not found` 
        });
      }

      // Calculate the required quantity based on quantity and measurement multiplier
      const requiredQty = item.qty * item.measurement;
      
      if (inventoryItem.qty < requiredQty) {
        return res.status(400).json({ 
          error: `Insufficient inventory for product ${inventoryItem.name}. Available: ${inventoryItem.qty}, Required: ${requiredQty}` 
        });
      }
    }
  }

  try {
    // ============================================================================
    // CREATE TRANSACTION DOCUMENT
    // ============================================================================
    const transaction = new Transaction({
      user_id,
      buyer_id,
      worker_id,
      type: transactionType,
      notes,
      payment_method,
      price: price || payment, // using the 'price' field from schema
      payment_direction,
      sale_price: sale_price,
      total_shipping: total_shipping?.toFixed(2),
      profit: profit?.toFixed(2),
      items: [] // start with empty items array
    });
    
    await transaction.save();

    // ============================================================================
    // HANDLE PAYMENT TRANSACTIONS
    // ============================================================================
    if (transactionType === "payment") {
      // Create a TransactionPayment record
      const transactionPayment = new TransactionPayment({
        transaction_id: transaction._id,
        buyer_id,
        amount_paid: payment,
        payment_direction,
        payment_method: payment_method || "unspecified",
        payment_date: new Date(),
      });
      
      await transactionPayment.save();

      // Update buyer's balance based on payment direction
      if (payment_direction === "received") {
        await Buyer.findByIdAndUpdate(buyer_id, { 
          $inc: { currentBalance: -payment } 
        });
      } else {
        await Buyer.findByIdAndUpdate(buyer_id, { 
          $inc: { currentBalance: payment } 
        });
      }

      // Update user's balance based on payment method
      if (payment_method === "Cash") {
        if (payment_direction === "received") {
          await User.findByIdAndUpdate(user_id, { 
            $inc: { cash_balance: payment } 
          });
        } else if (payment_direction === "given") {
          await User.findByIdAndUpdate(user_id, { 
            $inc: { cash_balance: -payment } 
          });
        }
      } else {
        // Handle other payment methods
        console.log("the_user?.other_balance", the_user);
        console.log("the_user?.other_balance", the_user?.other_balance);
        
        // Initialize the nested key if it doesn't exist
        if (!the_user?.other_balance?.hasOwnProperty(payment_method)) {
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

      // Create logs for payment transaction
      createlogs(the_user, {
        buyer_id,
        transaction_id: transaction?._id,
        type: transactionType,
        amount: payment_direction === "received" ? Number(payment) : -Number(payment),
        payment_method,
        payment_direction,
        description: `${payment} ${payment_method} ${payment_direction} ${payment_direction === "received" ? "from" : "to"} ${the_buyer?.firstName + " " + the_buyer?.lastName}`
      });

    // ============================================================================
    // HANDLE INVENTORY ADDITION TRANSACTIONS
    // ============================================================================
    } else if (transactionType === "inventory_addition") {
      const transactionItemIds: { transactionitem_id: any }[] = [];
      let description = '';

      // Process each item for inventory addition
      for (const item of items) {
        // Build description string
        description += `${item.qty} ${item.unit} of ${item?.name} (@ ${formatCurrency(item.sale_price || item?.price)}) ${('+ (🚚' + " " + (formatCurrency(item.shipping * item.qty)) + ")")} \n`;
        
        // Create transaction item record
        const transactionItem = new TransactionItem({
          transaction_id: transaction._id,
          inventory_id: item.inventory_id,
          user_id,
          buyer_id,
          qty: item.qty,
          measurement: item.measurement,
          shipping: item?.shipping,
          type,
          unit: item.unit,
          price: item.price,
          sale_price: item.sale_price,
        });
        
        await transactionItem.save();
        
        // Collect the TransactionItem _id
        transactionItemIds.push({ transactionitem_id: transactionItem._id });
        console.log("transactionType", transactionType);
      }

      // Calculate total shipping value
      let total_shipping_val = items.reduce((total: number, item: any) => {
        const shipping = Number(item?.shipping) * Number(item?.qty) || 0;
        return total + shipping;
      }, 0);
      total_shipping_val = total_shipping_val.toFixed(2)

      console.log("total_shipping_val", (total_shipping_val));
      console.log("(price + total_shipping)", (price + total_shipping_val));
      let roundBalance = (Number(price) + Number(total_shipping_val)).toFixed(2);
      console.log("roundBalance_total_shipping_val", roundBalance);
      // Update buyer's balance
      await Buyer.findByIdAndUpdate(buyer_id, { 
        $inc: { currentBalance: -roundBalance } 
      });

      // Update transaction with item IDs
      transaction.items = transactionItemIds;
      await transaction.save();

      // Create logs for inventory addition
      createlogs(the_user, {
        buyer_id,
        type: transactionType,
        transaction_id: transaction?._id,
        amount: price + total_shipping,
        description,
      });

    // ============================================================================
    // HANDLE SALE AND RETURN TRANSACTIONS
    // ============================================================================
    } else {
      const transactionItemIds: { transactionitem_id: any }[] = [];
      let description = '';

      // Process each item for sale/return
      for (const item of items) {
        // Build description string
        description += `${item.qty} ${item.unit} of ${item?.name} (@ ${formatCurrency(item.sale_price || item?.price)}) ${('+ (🚚' + " " + (formatCurrency(item.shipping * item.qty)) + ")")} \n`;
        
        // Create transaction item record
        const transactionItem = new TransactionItem({
          transaction_id: transaction._id,
          inventory_id: item.inventory_id,
          user_id,
          buyer_id,
          qty: item.qty,
          measurement: item.measurement,
          shipping: item?.shipping,
          type,
          unit: item.unit,
          price: item.price,
          sale_price: item.sale_price,
        });
        
        await transactionItem.save();

        // Collect the TransactionItem _id
        transactionItemIds.push({ transactionitem_id: transactionItem._id });
        console.log("transactionType", transactionType);

        // Determine inventory change: negative for sale, positive for return
        const qtyChange = (transactionType === "return") 
          ? (item.qty * item.measurement) 
          : -(item.qty * item.measurement);
        
        console.log("qtyChange", qtyChange);

        // Update buyer's currentBalance based on transaction type
        if (transactionType === "sale") {
          const saleAmount = (item.sale_price * item.measurement * item.qty).toFixed(2) 
          //+ (item.qty * item?.shipping);
          console.log("saleAmount",saleAmount);
          await Buyer.findByIdAndUpdate(buyer_id, { 
            $inc: { currentBalance: saleAmount } 
          });
        } else if (transactionType === "return") {
          const returnAmount = -((parseInt(item.price) * parseInt(item.measurement)) * item.qty + (parseInt(item.qty) * parseInt(item?.shipping)));
          console.log(returnAmount);
          await Buyer.findByIdAndUpdate(buyer_id, { 
            $inc: { currentBalance: returnAmount.toFixed(2) } 
          });
        }

        // Update the inventory quantity
        await Inventory.findByIdAndUpdate(item.inventory_id, { 
          $inc: { qty: qtyChange } 
        });
      }

      // Update transaction with item IDs
      transaction.items = transactionItemIds;
      await transaction.save();

      // Create logs for sale/return transaction
      createlogs(the_user, {
        transaction_id: transaction._id,
        buyer_id,
        type: transactionType,
        amount: transactionType === "sale" 
          ? parseInt(sale_price + total_shipping) 
          : -parseInt(price + total_shipping),
        description
      });
    }

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    res.status(201).json({ 
      message: 'Transaction processed', 
      transaction_id: transaction._id 
    });

  } catch (error: any) {
    console.error('error', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to calculate item total
const calculateItemTotal = (item: any, transactionType: string = 'sale', addShipping : boolean = true) => {
  // For sale transactions, use sale_price; for others, use price
  const unitPrice = transactionType === 'sale' ? (item.sale_price || item.price || 0) : (item.price || 0);
  const baseAmount = (item.qty || 0) * (item.measurement || 1) * unitPrice;
  const shippingAmount = (item.qty || 0) * (item.shipping || 0);
  if(addShipping == true) {
    return baseAmount + shippingAmount;
  } else {
    return baseAmount;
  }
};

// Helper function to calculate total transaction amount
const calculateTransactionTotal = (items: any[], shipping: number = 0, transactionType: string = 'sale',addShipping : boolean = true) => {
  return items.reduce((total, item) => total + calculateItemTotal(item, transactionType, addShipping), 0) 
  //+ shipping;
};

// PUT route to update existing transaction
router.put('/:id', 
  //checkAccess("sale", "update"), 
async (req: Request, res: Response) => {
  const { id } = req.params;
  const { 
    notes, 
    items, 
    original_items, 
    total_shipping, 
    original_total_shipping,
    buyer_id,
    user_id,
  } = req.body;
  console.log("req.body", req.body);
  
  try {
    // Find the existing transaction
    const existingTransaction = await Transaction.findById(id);
    if (!existingTransaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transactionType = existingTransaction.type;
    const the_user = await User.findById(user_id || existingTransaction.user_id);
    const the_buyer = await Buyer.findById(buyer_id || existingTransaction.buyer_id);

    if (!the_user || !the_buyer) {
      return res.status(404).json({ error: 'User or buyer not found' });
    }

    if (transactionType !== 'payment') {
      // Process inventory and balance changes for sale/return/inventory_addition transactions
      
      // Calculate original totals using the correct price field
      const originalTotal = calculateTransactionTotal(original_items || [], original_total_shipping || 0, transactionType, true);
      const newTotal = calculateTransactionTotal(items || [], total_shipping || 0, transactionType, true);
      const totalDifference = (newTotal - originalTotal).toFixed(2);
      
      console.log({ originalTotal, newTotal, totalDifference, transactionType });

      // Revert original inventory changes
      for (const originalItem of original_items || []) {
        if (transactionType === 'sale') {
          // Original sale decreased inventory, so we add it back
          const qtyChange = (originalItem.qty || 0) * (originalItem.measurement || 1);
          await Inventory.findByIdAndUpdate(originalItem.inventory_id, { 
            $inc: { qty: qtyChange } 
          });
        } else if (transactionType === 'return') {
          // Original return increased inventory, so we subtract it back
          const qtyChange = (originalItem.qty || 0) * (originalItem.measurement || 1);
          await Inventory.findByIdAndUpdate(originalItem.inventory_id, { 
            $inc: { qty: -qtyChange } 
          });
        }
        // For inventory_addition, no inventory changes needed during revert
      }

      // Apply new inventory changes
      for (const newItem of items || []) {
        if (transactionType === 'sale') {
          // New sale should decrease inventory
          const qtyChange = (newItem.qty || 0) * (newItem.measurement || 1);
          
          // Check if enough inventory is available
          const inventoryItem = await Inventory.findById(newItem.inventory_id);
          if (!inventoryItem || inventoryItem.qty < qtyChange) {
            return res.status(400).json({ 
              error: `Insufficient inventory for ${newItem.name}. Available: ${inventoryItem?.qty || 0}, Required: ${qtyChange}` 
            });
          }
          
          await Inventory.findByIdAndUpdate(newItem.inventory_id, { 
            $inc: { qty: -qtyChange } 
          });
        } else if (transactionType === 'return') {
          // New return should increase inventory
          const qtyChange = (newItem.qty || 0) * (newItem.measurement || 1);
          await Inventory.findByIdAndUpdate(newItem.inventory_id, { 
            $inc: { qty: qtyChange } 
          });
        }
        // For inventory_addition, no inventory changes needed
      }

      // Update buyer balance based on the difference
      if (transactionType === 'sale') {
        // For sales, buyer owes more if total increased (positive difference)
        await Buyer.findByIdAndUpdate(buyer_id, { 
          $inc: { currentBalance: totalDifference } 
        });
      } else if (transactionType === 'return') {
        // For returns, buyer gets credit back if total increased (negative impact on balance)
        await Buyer.findByIdAndUpdate(buyer_id, { 
          $inc: { currentBalance: -totalDifference } 
        });
      } else if (transactionType === 'inventory_addition') {
        // For inventory addition, buyer owes less if total decreased (negative difference)
        console.log({ totalDifference });
        await Buyer.findByIdAndUpdate(buyer_id, { 
          $inc: { currentBalance: -totalDifference } 
        });
      }

      // Update TransactionItem records
      for (const item of items || []) {
        if (item.transactionitem_id) {
          try {
            // Update transaction item with all relevant fields
            const updateFields: any = {
              qty: item.qty,
              measurement: item.measurement,
              price: item.price,
              shipping: item.shipping,
              unit: item.unit
            };
            
            // Include sale_price for sale transactions
            if (transactionType === 'sale' && item.sale_price !== undefined) {
              updateFields.sale_price = item.sale_price;
            }
            
            console.log("Updating transaction item:", item.transactionitem_id, updateFields);
            await TransactionItem.findByIdAndUpdate(item.transactionitem_id, updateFields);
            // Updated section for inventory_addition transaction type
            if (transactionType === 'inventory_addition') {
              // Update inventory with base price and shipping cost
              
              // Find the corresponding original item to calculate quantity difference
              const originalItem = original_items?.find((origItem: any) => origItem.inventory_id === item.inventory_id);
              const originalQty = originalItem ? (originalItem.qty || 0) * (originalItem.measurement || 1) : 0;
              const newQty = (item.qty || 0) * (item.measurement || 1);
              const qtyDifference = newQty - originalQty;
              
              console.log(`Inventory ${item.inventory_id}: Original qty: ${originalQty}, New qty: ${newQty}, Difference: ${qtyDifference}`);
              
              // Update inventory with the quantity difference and other fields
              await Inventory.findByIdAndUpdate(item?.inventory_id, {
                price: item.price, // Keep the cost price in inventory
                shippingCost: item.shipping,
                unit: item.unit,
                $inc: { qty: qtyDifference } // Add/subtract the difference instead of setting absolute value
              });
            }
          } catch (error) {
            console.error("Error updating transaction & inventory:", error);
          }
        } 
      }

      // Create log entry for the update
      let description = `${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)} transaction updated:\n`;
      for (const item of items || []) {
        const displayPrice = transactionType === 'sale' ? (item.sale_price || item.price || 0) : (item.price || 0);
        description += `${item.qty} ${item.unit} of ${item.name} (@ $${displayPrice.toFixed(2)})`;
        if (item.shipping) {
          description += ` + shipping $${(item.shipping * item.qty).toFixed(2)}`;
        }
        description += `\n`;
      }
      
      if (transactionType === 'sale') {
        // Calculate total profit for sale transactions
        const totalProfit = items.reduce((acc: number, item: any) => {
          const profit = (item.qty || 0) * (item.measurement || 1) * ((item.sale_price || 0) - (item.price * item?.shipping));
          return acc + profit;
        }, 0);
        existingTransaction.
        description += `Total Profit: $${totalProfit.toFixed(2)}`;
      }

      createlogs(the_user, {
        buyer_id: buyer_id || existingTransaction.buyer_id,
        transaction_id: id,
        type: `${transactionType}_update`,
        amount: totalDifference,
        description: description
      });
    }

    // Update the main transaction record
    existingTransaction.notes = notes !== undefined ? notes : existingTransaction.notes;
    existingTransaction.updated_at = new Date();
    existingTransaction.edited = true;
    existingTransaction.total_shipping = total_shipping !== undefined ? total_shipping : existingTransaction.total_shipping;
    
    // Handle previous values tracking
    if (existingTransaction?.prevValues) {
      existingTransaction.prevValues?.push({ 
        updated_at: new Date(), 
        original_items, 
        items 
      });
    } else {
      existingTransaction.prevValues = [{ 
        updated_at: new Date(), 
        original_items, 
        items 
      }];
    }
    
    // Update price/sale_price based on new totals for non-payment transactions
    if (transactionType !== 'payment') {
      const newTransactionTotal = calculateTransactionTotal(items || [], total_shipping || 0, transactionType, false);
      console.log("Updating transaction price:", newTransactionTotal);
      existingTransaction.price = newTransactionTotal;
      
      // For sale transactions, also calculate and store the total sale price
      if (transactionType === 'sale') {
        const totalSalePrice = items.reduce((acc: number, item: any) => {
          return acc + (item.qty || 0) * (item.measurement || 1) * (item.sale_price || 0);
        }, 0);
        const totalOrgPrice = original_items.reduce((acc: number, item: any) => {
          return acc + (item.qty || 0) * (item.measurement || 1) * (item.price || 0);
        }, 0);
        existingTransaction.sale_price = totalSalePrice 
        existingTransaction.price = totalOrgPrice;
        existingTransaction.profit = totalSalePrice - totalOrgPrice 
        //+ (total_shipping || 0);
      }
    }
    
    await existingTransaction.save();

    res.status(200).json({ 
      message: 'Transaction updated successfully', 
      transaction: existingTransaction 
    });

  } catch (error: any) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: error.message });
  }
});


router.get('/history/:buyer_id/:user_id', checkAccess("wholesale", "read"), async (req: Request, res: Response) => {
  try {
    const { buyer_id, user_id } = req.params;
    const { startDateTime, endDateTime } = req.query;
    
    // Default to today if no date range is provided
    let dateStart, dateEnd;
    
    if (startDateTime && endDateTime) {
      // Parse dates from query parameters
      dateStart = moment(startDateTime as string).toDate();
      dateEnd = moment(endDateTime as string).toDate();
    } else {
      // Default to today (12:00 AM - 11:59 PM)
      dateStart = moment().startOf('day').toDate();
      dateEnd = moment().endOf('day').toDate();
    }
    
    // Build a query condition based on provided parameters
    const query: any = {
      created_at: { $gte: dateStart, $lt: dateEnd }
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
      })
      .sort({ created_at: 1 }); // Sort by date ascending
    
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
