// transactionService.ts
import { Types } from 'mongoose';
import Transaction from '../models/Transaction';
import TransactionItem from '../models/TransactionItem';
import TransactionPayment from '../models/TransactionPayment';
import Inventory from '../models/Inventory';
import Buyer from '../models/Buyer';
import User from '../models/User';
import { createNotification } from '../routes/notifications';
import { createlogs, formatCurrency } from '../routes/transaction';


export interface TransactionItemData {
  inventory_id: string;
  qty: number;
  measurement: number;
  unit: string;
  price: number;
  sale_price: number;
  shipping: number;
  name: string;
}

export interface TransactionPayload {
  user_id: string;
  buyer_id: string;
  worker_id?: string;
  sale_id?: string;
  payment: number;
  price?: number;
  total_shipping?: number;
  payment_direction?: 'received' | 'given';
  created_by_role?: string;
  admin_id?: string;
  sale_price?: number;
  profit?: number;
  notes?: string;
  type?: 'sale' | 'return' | 'payment' | 'inventory_addition' | 'restock';
  payment_method?: string;
  items?: TransactionItemData[];
  skip_cash_user_balance?: boolean;
}

export interface TransactionResult {
  success: boolean;
  //message: string;
  transaction_id?: string;
  error?: string;
}

/**
 * Validate transaction payload
 */
const validatePayload = (payload: TransactionPayload): { isValid: boolean; error?: string } => {
  if (!payload.user_id || !Types.ObjectId.isValid(payload.user_id)) {
    return { isValid: false, error: 'Valid user_id is required' };
  }
  // if (!payload.buyer_id || !Types.ObjectId.isValid(payload.buyer_id)) {
  //   return { isValid: false, error: 'Valid buyer_id is required' };
  // }
  if (payload.type === 'payment' && !payload.payment) {
    return { isValid: false, error: 'Payment amount is required for payment transactions' };
  }
  if (['sale', 'return', 'inventory_addition', 'restock'].includes(payload.type || 'sale') && (!payload.items || payload.items.length === 0)) {
    return { isValid: false, error: 'Items are required for this transaction type' };
  }
  return { isValid: true };
};

/**
 * Validate inventory availability for sales
 */
const validateInventory = async (items: TransactionItemData[]): Promise<{ isValid: boolean; error?: string }> => {
  for (const item of items) {
    const inventoryItem = await Inventory.findById(item.inventory_id);

    if (!inventoryItem) {
      return {
        isValid: false,
        error: `Inventory item ${item.inventory_id} not found`
      };
    }

    const requiredQty = item.qty * item.measurement;

    if (inventoryItem.qty < requiredQty) {
      return {
        isValid: false,
        error: `Insufficient inventory for product ${inventoryItem.name}. Available: ${inventoryItem.qty}, Required: ${requiredQty}`
      };
    }
  }
  return { isValid: true };
};

/**
 * Create base transaction record
 */
const createTransaction = async (payload: TransactionPayload, transactionType: string, user: any) => {
  let obj = {
    user_id: payload.user_id,
    buyer_id: payload.buyer_id,
    worker_id: payload.worker_id,
    type: transactionType,
    sale_id: payload.sale_id,
    notes: payload.notes,
    payment_method: payload.payment_method,
    price: payload.price || payload.payment,
    payment_direction: payload.payment_direction,
    sale_price: payload.sale_price,
    total_shipping: payload.total_shipping?.toFixed(2),
    profit: payload.profit?.toFixed(2),
    items: [],
    created_by_role: "admin",
    admin_id: undefined
  }
  if (user.created_by) {
    obj.created_by_role = "user"
    obj.admin_id = user.created_by
  }
  const transaction = new Transaction(obj);
  await transaction.save();
  return transaction;
};

/**
 * Update user balance based on payment method and direction
 */
const updateUserBalance = async (userId: string, paymentMethod: string, amount: number, direction: 'received' | 'given') => {
  const user = await User.findById(userId);
  if (!user) return;

  const adjustedAmount = direction === 'received' ? amount : -amount;

  if (paymentMethod === 'Cash') {
    await User.findByIdAndUpdate(userId, {
      $inc: { cash_balance: adjustedAmount }
    });
  } else {
    // Initialize the nested key if it doesn't exist
    if (!user.other_balance?.hasOwnProperty(paymentMethod)) {
      await User.findByIdAndUpdate(userId, {
        $set: { [`other_balance.${paymentMethod}`]: 0 }
      });
    }

    await User.findByIdAndUpdate(userId, {
      $inc: { [`other_balance.${paymentMethod}`]: adjustedAmount }
    });
  }
};

/**
 * Process payment transaction
 */
const processPaymentTransaction = async (transaction: any, payload: TransactionPayload, user: any, buyer: any, skip_cash_user_balance: boolean = false): Promise<TransactionResult> => {
  const { payment, payment_direction = 'received', payment_method = 'unspecified' } = payload;
  console.log({ payment, payment_direction, payment_method })

  // Check balance for outgoing payments
  if (payment_direction === "given") {
    console.log("user?.cash_balance", user?.cash_balance);

    let userBalance = 0;
    let balanceType = '';

    if (payment_method === "EFT") {
      userBalance = user?.other_balance?.EFT || 0;
      balanceType = 'EFT';
    } else if (payment_method === "Crypto") {
      userBalance = user?.other_balance?.Crypto || 0;
      balanceType = 'Crypto';
    } else if (payment_method === "Cash") {
      userBalance = user?.cash_balance || 0;
      balanceType = 'Cash';
    }

    // if (Number(payment) > userBalance) {
    //   return {
    //     success: false,
    //     error: `Insufficient ${balanceType} balance. You only have ${userBalance} available.`,
    //   };
    // }
  }
  let obj = {
    transaction_id: transaction._id,
    buyer_id: payload.buyer_id,
    amount_paid: payment,
    payment_direction,
    payment_method,
    payment_date: new Date(),
    created_by_role: 'admin',
    user_id: user?.id,
    admin_id: undefined
  }
  if (user.created_by) {
    obj.created_by_role = "user"
    obj.admin_id = user.created_by
  }
  // Create TransactionPayment record
  const transactionPayment = new TransactionPayment(obj);

  await transactionPayment.save();

  // Update buyer's balance
  const buyerBalanceChange = payment_direction === 'received' ? -payment : payment;
  console.log({
    payment_direction,
    buyerBalanceChange,
    buyer_id: payload.buyer_id
  })
  const the_buyer = await Buyer.findById(payload.buyer_id)
  await Buyer.findByIdAndUpdate(payload.buyer_id, {
    $inc: { currentBalance: buyerBalanceChange }
  });
  if (!skip_cash_user_balance) {
    // Update user's balance
    await updateUserBalance(payload.user_id, payment_method, payment, payment_direction);
  }

  // Link TransactionPayment to transaction
  transaction.transactionpayment_id = transactionPayment._id;
  await transaction.save();

  // Create logs
  createlogs(user, {
    buyer_id: payload.buyer_id,
    user_created_by: user?.created_by,
    worker_id: payload.worker_id,
    transaction_id: transaction._id,
    type: 'payment',
    amount: payment_direction === 'received' ? payment : -payment,
    payment_method,
    payment_direction,
    description: `${payment} ${payment_method} ${payment_direction} ${payment_direction === 'received' ? 'from' : 'to'} ${buyer.firstName} ${buyer.lastName}`
  });

  return { success: true };
};


/**
 * Process inventory addition/restock transaction
 */
const processInventoryTransaction = async (transaction: any, payload: TransactionPayload, user: any, transactionType: string) => {
  const { items = [], price = 0, buyer_id, worker_id } = payload;
  const transactionItemIds: { transactionitem_id: any }[] = [];
  let description = '';

  // Process each item
  for (const item of items) {
    description += `${item.qty} ${item.unit} of ${item.name} (@ ${formatCurrency(item.sale_price || item.price)}) ${item.shipping ? '+ (🚚 ' + formatCurrency(item.shipping * item.qty) + ')' : ''}\n`;
    let obj = {
      transaction_id: transaction._id,
      inventory_id: item.inventory_id,
      user_id: payload.user_id,
      buyer_id,
      qty: item.qty,
      measurement: item.measurement,
      shipping: item.shipping,
      type: transactionType,
      unit: item.unit,
      price: item.price,
      sale_price: item.sale_price,
      created_by_role: 'admin',
      admin_id: undefined
    }

    if (user.created_by) {
      obj.created_by_role = "user"
      obj.admin_id = user.created_by
    }
    const transactionItem = new TransactionItem(obj);

    await transactionItem.save();
    transactionItemIds.push({ transactionitem_id: transactionItem._id });

    // Update inventory for restock
    if (transactionType === 'restock') {
      await Inventory.findByIdAndUpdate(item.inventory_id, {
        $inc: { qty: item.qty },
        shippingCost: item?.shipping,
        price: item?.price
      });
    }
  }

  // Calculate total shipping
  const totalShippingVal = items.reduce((total, item) => {
    return total + (Number(item.shipping) * Number(item.qty) || 0);
  }, 0);

  const roundBalance = Number(price) + Number(totalShippingVal);

  // Update buyer's balance
  await Buyer.findByIdAndUpdate(buyer_id, {
    $inc: { currentBalance: -roundBalance }
  });

  // Update transaction with item IDs
  transaction.items = transactionItemIds;
  await transaction.save();

  // Create logs
  createlogs(user, {
    buyer_id,
    worker_id,
    type: transactionType,
    transaction_id: transaction._id,
    amount: roundBalance,
    description,
  });
};


const processInventoryTransactionWithoutBuyer = async (transaction: any, payload: TransactionPayload, user: any, transactionType: string) => {
  const { items = [], price = 0, buyer_id, worker_id } = payload;
  const transactionItemIds: { transactionitem_id: any }[] = [];
  let description = '';

  // Process each item
  for (const item of items) {
    description += `${item.qty} ${item.unit} of ${item.name} (@ ${formatCurrency(item.sale_price || item.price)}) ${item.shipping ? '+ (🚚 ' + formatCurrency(item.shipping * item.qty) + ')' : ''}\n`;
    console.log("buyer_id***", buyer_id)
    let obj = {
      transaction_id: transaction._id,
      inventory_id: item.inventory_id,
      user_id: payload.user_id,
      //buyer_id,
      qty: item.qty,
      measurement: item.measurement,
      shipping: item.shipping,
      type: transactionType,
      unit: item.unit,
      price: item.price,
      sale_price: item.sale_price,
      created_by_role: 'admin',
      admin_id: undefined
    }
    if (user.created_by) {
      obj.created_by_role = "user"
      obj.admin_id = user.created_by
    }
    const transactionItem = new TransactionItem(obj);
    console.log("buyer_id***", buyer_id)
    await transactionItem.save();
    transactionItemIds.push({ transactionitem_id: transactionItem._id });

    // Update inventory for restock
    if (transactionType === 'restock') {
      await Inventory.findByIdAndUpdate(item.inventory_id, {
        $inc: { qty: item.qty },
        shippingCost: item?.shipping,
        price: item?.price
      });
    }
  }

  // Calculate total shipping
  const totalShippingVal = items.reduce((total, item) => {
    return total + (Number(item.shipping) * Number(item.qty) || 0);
  }, 0);

  const roundBalance = Number(price) + Number(totalShippingVal);

  // // Update buyer's balance
  // await Buyer.findByIdAndUpdate(buyer_id, { 
  //   $inc: { currentBalance: -roundBalance } 
  // });

  // Update transaction with item IDs
  transaction.items = transactionItemIds;
  await transaction.save();

  // Create logs
  createlogs(user, {
    //buyer_id,
    //worker_id,
    type: transactionType,
    transaction_id: transaction._id,
    amount: roundBalance,
    description,
  });
};

/**
 * Process sale/return transaction
 */
const processSaleReturnTransaction = async (transaction: any, payload: TransactionPayload, user: any, buyer: any, transactionType: string) => {
  const { items = [], buyer_id, worker_id, sale_price = 0, price = 0, total_shipping = 0 } = payload;
  const transactionItemIds: { transactionitem_id: any }[] = [];
  let description = '';

  // Process each item
  for (const item of items) {
    description += `${item.qty} ${item.unit} of ${item.name} (@ ${formatCurrency(item.sale_price || item.price)})\n`;
    let obj = {
      transaction_id: transaction._id,
      inventory_id: item.inventory_id,
      user_id: payload.user_id,
      buyer_id,
      qty: item.qty,
      measurement: item.measurement,
      shipping: item.shipping,
      type: transactionType,
      unit: item.unit,
      price: item.price,
      sale_price: item.sale_price,
      created_by_role: "admin",
      admin_id: undefined
    }
    if (user.created_by) {
      obj.created_by_role = "user"
      obj.admin_id = user.created_by
    }
    const transactionItem = new TransactionItem(obj);

    await transactionItem.save();
    transactionItemIds.push({ transactionitem_id: transactionItem._id });

    // Calculate inventory change
    const qtyChange = transactionType === 'return'
      ? (item.qty * item.measurement)
      : -(item.qty * item.measurement);

    // Update buyer's balance
    if (transactionType === 'sale') {
      const saleAmount = Number((item.sale_price * item.measurement * item.qty).toFixed(2));
      await Buyer.findByIdAndUpdate(buyer_id, {
        $inc: { currentBalance: saleAmount }
      });
    } else if (transactionType === 'return') {
      const returnAmount = -((item.price * item.measurement * item.qty) + (item.qty * (item.shipping || 0)));
      await Buyer.findByIdAndUpdate(buyer_id, {
        $inc: { currentBalance: Number(returnAmount.toFixed(2)) }
      });
    }

    // Update inventory
    await Inventory.findByIdAndUpdate(item.inventory_id, {
      $inc: { qty: qtyChange }
    });

    // Check for low inventory
    const inventory = await Inventory.findById(item.inventory_id);
    if (inventory && inventory.qty < 4) {
      createNotification({
        user_id: payload.user_id,
        type: 'product_low_quantity',
        message: `Inventory alert: The product "${inventory.name}" is out of stock or has very low quantity.`,
      });
    }
  }

  // Update transaction with item IDs
  transaction.items = transactionItemIds;
  await transaction.save();

  // Create logs
  createlogs(user, {
    transaction_id: transaction._id,
    buyer_id,
    worker_id,
    type: transactionType,
    amount: transactionType === 'sale' ? Number(sale_price) : -(Number(price) + Number(total_shipping)),
    description
  });
};

/**
 * Main transaction processing function
 */
export const processTransaction = async (payload: TransactionPayload): Promise<TransactionResult> => {
  try {
    console.log('Processing transaction:', payload);

    // Validate payload
    const validation = validatePayload(payload);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    const transactionType = payload.type || 'sale';

    // Fetch user and buyer data
    const [user, buyer] = await Promise.all([
      User.findById(payload.user_id),
      Buyer.findById(payload.buyer_id)
    ]);

    if (!user) {
      return { success: false, error: 'User not found' };
    }
    // if (!buyer) {
    //   return { success: false, error: 'Buyer not found' };
    // }

    // Validate inventory for sales
    if (transactionType === 'sale') {
      const inventoryValidation = await validateInventory(payload.items || []);
      if (!inventoryValidation.isValid) {
        return { success: false, error: inventoryValidation.error };
      }
    }

    // Create base transaction
    const transaction = await createTransaction(payload, transactionType, user);

    // Process based on transaction type
    let result;
    switch (transactionType) {
      case 'payment':
        result = await processPaymentTransaction(transaction, payload, user, buyer, payload.skip_cash_user_balance);
        console.log("resultttt", result)
        if (!result.success) {
          return result; // Return error immediately
        }
        break;
      case 'inventory_addition':
      case 'restock':
        if (!payload?.buyer_id) {
          result = await processInventoryTransactionWithoutBuyer(transaction, payload, user, transactionType);
        } else {
          result = await processInventoryTransaction(transaction, payload, user, transactionType);
        }
        // if (result && !result.success) {
        //   return result;
        // }
        break;
      default: // sale, return
        result = await processSaleReturnTransaction(transaction, payload, user, buyer, transactionType);
      // if (result && !result.success) {
      //   return result;
      // }
    }

    return {
      success: true,
      //message: 'Transaction processed successfully',
      transaction_id: transaction._id.toString()
    };

  } catch (error: any) {
    console.error('Transaction processing error:', error);
    return {
      success: false,
      error: error.message || 'Transaction processing failed'
    };
  }
};