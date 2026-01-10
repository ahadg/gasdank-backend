"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addExpenseTool = exports.update_balance_buyer = exports.updateBuyerTool = exports.addBuyerTool = exports.findExpensesTool = exports.findBuyersTool = exports.findInventoryTool = exports.addInventoryTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const mongoose_1 = __importDefault(require("mongoose"));
const Buyer_1 = __importDefault(require("../models/Buyer"));
const Category_1 = __importDefault(require("../models/Category"));
const Transaction_1 = __importDefault(require("../models/Transaction"));
const Inventory_1 = __importDefault(require("../models/Inventory"));
const TransactionItem_1 = __importDefault(require("../models/TransactionItem"));
const transaction_1 = require("../routes/transaction");
const activity_1 = require("../routes/activity");
const TransactionPayment_1 = __importDefault(require("../models/TransactionPayment"));
exports.addInventoryTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config.configurable?.userId;
    let { shippingCost, qty, price, unit, productName, categoryName } = input;
    console.log("input", input);
    qty = Number(qty);
    price = Number(price);
    shippingCost = Number(shippingCost);
    if (!userId)
        throw new Error("User ID required");
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const avg_shipping = shippingCost / qty;
    const total_price = price * qty;
    // find with firstname or lastname
    const buyer = await mongoose_1.default.model("Buyer").findOne({
        firstName: input.buyerName
    });
    console.log("🙋‍♂️ buyer_found", buyer);
    if (!buyer) {
        throw new Error("Client/Buyer not found");
    }
    const category = await Category_1.default.findOne({
        name: categoryName
    });
    console.log("🙋‍♂️ category_found", category);
    if (!category) {
        throw new Error("category not found");
    }
    const newProduct = new Inventory_1.default({
        user_id: userId,
        buyer_id: buyer?._id,
        //reference_number: prod.referenceNumber,
        name: productName,
        qty: qty,
        unit: unit,
        category: category?._id,
        price: price,
        shippingCost: avg_shipping.toFixed(2),
        status: "",
        notes: "",
    });
    newProduct.save();
    const transaction = new Transaction_1.default({
        user_id: userId,
        buyer_id: buyer?._id,
        //worker_id,
        type: "inventory_addition",
        notes: "inventory addition from bot",
        price: total_price,
        total_shipping: shippingCost?.toFixed(2),
    });
    await transaction.save();
    const transactionItem = new TransactionItem_1.default({
        transaction_id: transaction._id,
        inventory_id: newProduct._id,
        user_id: userId,
        buyer_id: buyer?._id,
        qty: qty,
        measurement: 1,
        shipping: avg_shipping.toFixed(2),
        type: "inventory_addition",
        unit: unit,
        price: price,
        //sale_price: item.sale_price,
    });
    await transactionItem.save();
    transaction.items = [{ transactionitem_id: transactionItem._id }];
    transaction.save();
    let roundBalance = (Number(price * qty) + Number(shippingCost)).toFixed(2);
    console.log("roundBalance_total_shipping_val", roundBalance);
    // Update buyer's balance
    await Buyer_1.default.findByIdAndUpdate(buyer?._id, {
        $inc: { currentBalance: -roundBalance }
    });
    // Create logs for inventory addition
    (0, transaction_1.createlogs)({ _id: userId }, {
        buyer_id: buyer._id,
        //worker_id,
        type: "inventory_addition",
        transaction_id: transaction?._id,
        amount: (price * qty) + shippingCost,
        description: `${qty} ${unit} of ${productName} added from Bot`,
    });
    return { success: true, data: "ok" };
}, {
    name: "add_inventory",
    description: "Add inventory/products item to database",
    schema: zod_1.z.object({
        buyerName: zod_1.z.string().describe("Name of the buyer/client"),
        productName: zod_1.z.string().describe("Name of the product"),
        categoryName: zod_1.z.string().describe("category of the product"),
        qty: zod_1.z.string().describe("Quantity of the product"),
        shippingCost: zod_1.z.string().describe("ShippingCost of the product"),
        unit: zod_1.z.enum(["pound", "kg", "gram"]).describe("unit of the product"),
        price: zod_1.z.string().describe("price of the product")
    })
});
exports.findInventoryTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const query = { ...input.query, user_id: userObjectId };
    try {
        const results = await mongoose_1.default.model('Inventory').find(query);
        return { success: true, data: results };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "find_inventory",
    description: "Find inventory/product items from database. Can search by product name, buyer, or other criteria.",
    schema: zod_1.z.object({
        query: zod_1.z.object({}).optional().describe("MongoDB query object to search inventory")
    })
});
exports.findBuyersTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const query = { ...input.query, user_id: userObjectId };
    try {
        const results = await mongoose_1.default.model('Buyer').find(query);
        return { success: true, data: results };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "find_buyers",
    description: "Find buyers/clients from database. Can search by name, email, or other criteria.",
    schema: zod_1.z.object({
        query: zod_1.z.object({}).optional().describe("MongoDB query object to search buyers")
    })
});
exports.findExpensesTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const query = { ...input.query, user_id: userObjectId };
    try {
        const results = await mongoose_1.default.model('Expense').find(query);
        return { success: true, data: results };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "find_expenses",
    description: "Find expenses from database. Can search by date range, category, or amount.",
    schema: zod_1.z.object({
        query: zod_1.z.object({}).optional().describe("MongoDB query object to search expenses")
    })
});
exports.addBuyerTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    try {
        console.log('addBuyerTool_input', input);
        const newBuyer = new Buyer_1.default({
            user_id: userId,
            ...input,
            currentBalance: input?.balance,
            startingBalance: input?.balance
        });
        await newBuyer.save();
        (0, activity_1.createActivity)({
            user_id: userId,
            //user_created_by: user_created_by_id,
            action: 'create',
            resource_type: 'buyer',
            page: 'buyer',
            type: 'client_created',
            description: `${input.firstName} ${input.lastName} client created`,
        });
        return { success: true, data: "ok" };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "add_buyer",
    description: "Add a new buyer/client to the system.",
    schema: zod_1.z.object({
        firstName: zod_1.z.string().describe("First name of the buyer"),
        lastName: zod_1.z.string().describe("Last name of the buyer"),
        email: zod_1.z.string().email().describe("Email address of the buyer"),
        phone: zod_1.z.string().optional().describe("Phone number of the buyer"),
        balance: zod_1.z.number().describe("Initial balance/outstanding amount for the buyer")
    })
});
exports.updateBuyerTool = (0, tools_1.tool)(async (input) => {
    try {
        const response = await fetch('https://manapnl.com/api/buyers/aiedit', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        });
        const result = await response.json();
        return { success: response.ok, data: result };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "update_buyer",
    description: "Update an existing buyer's information.",
    schema: zod_1.z.object({
        identifier: zod_1.z.string().describe("Identifier to find the buyer (email, firstName, or lastName)"),
        firstName: zod_1.z.string().optional().describe("Updated first name"),
        lastName: zod_1.z.string().optional().describe("Updated last name"),
        email: zod_1.z.string().email().optional().describe("Updated email address"),
        phone: zod_1.z.string().optional().describe("Updated phone number"),
        balance: zod_1.z.number().optional().describe("Updated balance amount")
    })
});
exports.update_balance_buyer = (0, tools_1.tool)(async (input, config) => {
    try {
        const { firstName, lastName, email, balance, type, paymentDirection, paymentMethod } = input;
        const userId = config.configurable?.userId;
        if (!userId)
            throw new Error("User ID required");
        const buyer = await mongoose_1.default.model("Buyer").findOne({
            firstName: firstName
        });
        console.log("🙋‍♂️ buyer_found", buyer);
        if (!buyer) {
            throw new Error("Client/Buyer not found");
        }
        const transaction = new Transaction_1.default({
            user_id: userId,
            buyer_id: buyer?._id,
            //worker_id,
            type: "inventory_addition",
            notes: "inventory addition from bot",
            payment_direction: paymentDirection,
            payment_method: paymentMethod,
            price: balance,
        });
        await transaction.save();
        // Create a TransactionPayment record
        const transactionPayment = new TransactionPayment_1.default({
            transaction_id: transaction._id,
            buyer_id: buyer?._id,
            amount_paid: balance,
            payment_direction: paymentDirection,
            payment_method: paymentMethod || "unspecified",
            payment_date: new Date(),
        });
        await transactionPayment.save();
        // Update buyer's balance based on payment direction
        if (paymentDirection === "received") {
            await Buyer_1.default.findByIdAndUpdate(buyer?._id, {
                $inc: { currentBalance: -balance }
            });
        }
        else {
            await Buyer_1.default.findByIdAndUpdate(buyer?._id, {
                $inc: { currentBalance: balance }
            });
        }
        transaction.transactionpayment_id = transactionPayment._id;
        transaction.save();
        // Create logs for inventory addition
        (0, transaction_1.createlogs)({ _id: userId }, {
            buyer_id: buyer?._id,
            //worker_id,
            transaction_id: transaction?._id,
            type: "payment",
            amount: paymentDirection === "received" ? Number(balance) : -Number(balance),
            payment_method: paymentMethod,
            payment_direction: paymentDirection,
            description: `${balance} ${paymentMethod} ${paymentDirection} ${paymentDirection === "received" ? "from" : "to"} ${firstName + " "}`
        });
        return { success: "success", data: "ok" };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "update_buyer",
    description: "Update an existing buyer's information.",
    schema: zod_1.z.object({
        firstName: zod_1.z.string().optional().describe("first name of buyer/client"),
        lastName: zod_1.z.string().optional().describe("last name of buyer/client"),
        email: zod_1.z.string().email().optional().describe("email address of buyer/client"),
        balance: zod_1.z.number().optional().describe("Add balance amount"),
        paymentMethod: zod_1.z.enum(["cash", "cryto", "eft"]).optional().describe("payment method"),
        paymentDirection: zod_1.z.string().describe("recieved or given to buyer/client")
    })
});
exports.addExpenseTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    try {
        const category = await Category_1.default.findOne({
            name: new RegExp(`^${input?.category_name}$`, 'i')
        });
        console.log("🙋‍♂️ category_found", category);
        if (!category) {
            throw new Error("category not found");
        }
        const response = await fetch('https://manapnl.com/api/expense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                category_id: category?.id,
                ...input
            })
        });
        const result = await response.json();
        return { success: response.ok, data: result };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "add_expense",
    description: "Add a new expense to the system.",
    schema: zod_1.z.object({
        category_name: zod_1.z.string().describe("Category name for the expense (e.g., Marketing, Transport, Packaging)"),
        amount: zod_1.z.number().positive().describe("Expense amount in dollars")
    })
});
