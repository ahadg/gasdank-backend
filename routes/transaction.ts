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
import { createNotification } from './notifications';
import { processTransaction, round, roundCurrency } from '../utils/transactionHandler';


const router = Router();
router.use(authenticateJWT);



export const createlogs = (user: any, obj: any) => {
  createActivity({
    user_id: user?._id,
    user_created_by: user?.user_created_by || user?.created_by,
    worker_id: obj?.worker_id,
    action: "create",
    resource_type: obj?.type,
    page: "transaction",
    type: obj?.type,
    amount: obj?.amount, // used for financial activity
    payment_method: obj?.payment_method, // e.g., 'credit_card', 'paypal'
    payment_direction: obj?.payment_direction,
    description: obj.description,
    transaction_id: obj?.transaction_id,
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

router.get('/sales/:buyerid', async (req, res) => {
  try {
    const { buyerid } = req.params;

    const transaction = await Transaction.find({ buyer_id: buyerid, type: "sale", }).populate({
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
    console.log("adsd", { buyerid, type: "sale" })
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
  try {
    // Extract data from request body
    const result = await processTransaction(req.body);

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================
    if (result.success) {
      res.status(201).json({
        message: result.success,
        transaction_id: result.transaction_id
      });
    } else {
      const statusCode = result.error?.includes('not found') ? 404 :
        result.error?.includes('Insufficient') ? 400 : 500;
      res.status(statusCode).json({ error: result.error });
    }

  } catch (error: any) {
    console.error('error', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to calculate item total
const calculateItemTotal = (item: any, transactionType: string = 'sale', addShipping: boolean = true) => {
  // For sale transactions, use sale_price; for others, use price
  const unitPrice = transactionType === 'sale' ? (item.sale_price || item.price || 0) : (item.price || 0);
  const multiplier = item.unit === 'per piece' ? 1 : (item.measurement || 1);
  const baseAmount = (item.qty || 0) * multiplier * unitPrice;
  const shippingAmount = (item.qty || 0) * (item.shipping || 0);
  if (addShipping == true) {
    return Number((baseAmount + shippingAmount).toFixed(2));
  } else {
    return Number(baseAmount.toFixed(2));
  }
};

// Helper function to calculate total transaction amount
const calculateTransactionTotal = (items: any[], shipping: number = 0, transactionType: string = 'sale', addShipping: boolean = true) => {
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
            const qtyChange = round((originalItem.qty || 0) * (originalItem.measurement || 1));
            await Inventory.findByIdAndUpdate(originalItem.inventory_id, {
              $inc: { qty: qtyChange }
            });
          } else if (transactionType === 'return') {
            // Original return increased inventory, so we subtract it back
            const qtyChange = round((originalItem.qty || 0) * (originalItem.measurement || 1));
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
            const qtyChange = round((newItem.qty || 0) * (newItem.measurement || 1));

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
            const qtyChange = round((newItem.qty || 0) * (newItem.measurement || 1));
            await Inventory.findByIdAndUpdate(newItem.inventory_id, {
              $inc: { qty: qtyChange }
            });
          }
          // For inventory_addition, no inventory changes needed
        }

        // Update buyer balance based on the difference
        const roundedDiff = roundCurrency(Number(totalDifference));
        if (transactionType === 'sale') {
          // For sales, buyer owes more if total increased (positive difference)
          await Buyer.findByIdAndUpdate(buyer_id, {
            $inc: { currentBalance: roundedDiff }
          });
        } else if (transactionType === 'return') {
          // For returns, buyer gets credit back if total increased (negative impact on balance)
          await Buyer.findByIdAndUpdate(buyer_id, {
            $inc: { currentBalance: -roundedDiff }
          });
        } else if (transactionType === 'inventory_addition') {
          // For inventory addition, buyer owes less if total decreased (negative difference)
          await Buyer.findByIdAndUpdate(buyer_id, {
            $inc: { currentBalance: -roundedDiff }
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
                const originalQty = originalItem ? round((originalItem.qty || 0) * (originalItem.measurement || 1)) : 0;
                const newQty = round((item.qty || 0) * (item.measurement || 1));
                const qtyDifference = round(newQty - originalQty);

                console.log(`Inventory ${item.inventory_id}: Original qty: ${originalQty}, New qty: ${newQty}, Difference: ${qtyDifference}`);

                // Update inventory with the quantity difference and other fields
                await Inventory.findByIdAndUpdate(item?.inventory_id, {
                  price: roundCurrency(item.price), // Keep the cost price in inventory
                  shippingCost: roundCurrency(item.shipping),
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
          const displayUnit = item.unit === 'per piece' ? 'pcs' : (item.unit === 'pounds' ? 'lbs' : (item.unit === 'gram' ? 'g' : (item.unit === 'kg' ? 'kg' : item.unit)));
          description += `${item.qty} ${displayUnit} of ${item.name} (@ $${displayPrice.toFixed(2)})`;
          if (item.shipping) {
            description += ` + shipping $${(Number(item.shipping) * Number(item.qty)).toFixed(2)}`;
          }
          description += `\n`;
        }

        if (transactionType === 'sale') {
          // Calculate total profit for sale transactions
          const totalProfit = items.reduce((acc: number, item: any) => {
            const cost = roundCurrency((item.price || 0) * (item.measurement || 1) * (item.qty || 0));
            const sale = roundCurrency((item.sale_price || 0) * (item.measurement || 1) * (item.qty || 0));
            const shippingCost = roundCurrency((item.qty || 0) * (item.shipping || 0));
            return acc + (sale - cost - shippingCost);
          }, 0);
          existingTransaction.profit = roundCurrency(totalProfit);
          description += `Total Profit: $${existingTransaction.profit.toFixed(2)}`;
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
            return acc + roundCurrency((item.qty || 0) * (item.measurement || 1) * (item.sale_price || 0));
          }, 0);
          const totalOrgPrice = items.reduce((acc: number, item: any) => {
            return acc + roundCurrency((item.qty || 0) * (item.measurement || 1) * (item.price || 0));
          }, 0);
          const totalShippingCost = items.reduce((acc: number, item: any) => {
            return acc + roundCurrency((item.qty || 0) * (item.shipping || 0));
          }, 0);

          existingTransaction.sale_price = roundCurrency(totalSalePrice);
          existingTransaction.price = roundCurrency(totalOrgPrice);
          existingTransaction.profit = roundCurrency(totalSalePrice - totalOrgPrice - totalShippingCost);
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

    if (buyer_id && buyer_id !== 'all') {
      query.buyer_id = buyer_id;
    }

    if (user_id) {
      let userIds: any[] = [user_id];
      const user = await User.findById(user_id);
      if (user) {
        if (user.role === 'admin' || user.role === 'superadmin') {
          const workers = await User.find({ created_by: user._id }).select('_id');
          userIds = [user._id, ...workers.map((w) => w._id)];
        } else if (user.role === 'user' && user.created_by) {
          const adminId = user.created_by;
          const fellowWorkers = await User.find({ created_by: adminId }).select('_id');
          userIds = [user._id, adminId, ...fellowWorkers.map((w) => w._id)];
        }
      }
      query.user_id = { $in: userIds };
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
      .populate({
        path: 'sample_id',
        model: 'Sample'
      })
      .sort({ created_at: 1 }); // Sort by date ascending

    res.status(200).json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


router.get('/itemshistory/:buyer_id/:inventory_id', checkAccess("sale", "read"), async (req: Request, res: Response) => {
  try {
    console.log("req.params;", req.params)
    const { buyer_id, inventory_id } = req.params;

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
    console.log("error", error)
    res.status(500).json({ error: error.message });
  }
});

// recent tranaction
router.get('/recent/:buyer_id/:inventory_id', checkAccess("sale", "read"), async (req: Request, res: Response) => {
  try {
    console.log("req.params:", req.params);
    const { buyer_id, inventory_id } = req.params;

    // Get all sale transactions for this buyer and product
    const saleTransactions = await TransactionItem.find({
      buyer_id: buyer_id,
      inventory_id: inventory_id,
      type: "sale"
    })
      .sort({ created_at: -1 }) // Most recent first
      .populate({
        path: 'inventory_id',
        model: 'Inventory'
      })
      .populate({
        path: 'transaction_id',
        model: 'Transaction',
        select: 'created_at'
      });

    // Get all return transactions for this buyer and product
    const returnTransactions = await TransactionItem.find({
      buyer_id: buyer_id,
      inventory_id: inventory_id,
      type: "return"
    });

    // Calculate totals
    const totalSoldQty = saleTransactions.reduce((total, sale) => {
      return total + (sale.qty * sale.measurement);
    }, 0);

    const totalReturnedQty = returnTransactions.reduce((total, returnItem) => {
      return total + (returnItem.qty * returnItem.measurement);
    }, 0);

    const availableToReturn = totalSoldQty - totalReturnedQty;

    const buyer = await Buyer.findById(buyer_id);

    // Format response data
    const formattedTransactions = saleTransactions.map(transaction => ({
      _id: transaction._id,
      qty: transaction.qty,
      measurement: transaction.measurement,
      unit: transaction.unit,
      shipping: transaction.shipping || 0,
      price: transaction.price,
      sale_price: transaction.sale_price,
      created_at: transaction.transaction_id?.created_at || transaction.created_at
    }));

    res.status(200).json({
      saleTransactions: formattedTransactions,
      buyer,
      totals: {
        totalSold: totalSoldQty,
        totalReturned: totalReturnedQty,
        availableToReturn: availableToReturn
      }
    });
  } catch (error: any) {
    console.log("error", error);
    res.status(500).json({ error: error.message });
  }
});


export default router;
