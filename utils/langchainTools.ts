import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import mongoose from 'mongoose';
import Buyer from "../models/Buyer";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import Inventory from "../models/Inventory";
import TransactionItem from "../models/TransactionItem";
import { createlogs } from "../routes/transaction";
import { createActivity } from "../routes/activity";
import TransactionPayment from "../models/TransactionPayment";

// Define the state interface
interface AgentState {
    messages: BaseMessage[];
    userId: string;
    sessionId: string;
  }
  
export const addInventoryTool = tool(
    async (input : { buyerName: string; unit: string;categoryName : string; productName: string; qty: number; shippingCost: number; price: number },config) => {
        const userId = config.configurable?.userId
        let {shippingCost,qty,price,unit,productName,categoryName} = input
        console.log("input",input)
        qty = Number(qty)
        price = Number(price)
        shippingCost = Number(shippingCost)
        if (!userId) throw new Error("User ID required");
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const avg_shipping = shippingCost / qty
        const total_price = price * qty
        // find with firstname or lastname
        const buyer: any = await mongoose.model("Buyer").findOne({
            firstName : input.buyerName
        })
        console.log("🙋‍♂️ buyer_found",buyer)
        if(!buyer) {
            throw new Error("Client/Buyer not found");
        }
        const category : any = await Category.findOne({
            name : categoryName
        })
        console.log("🙋‍♂️ category_found",category)
        if(!category) {
            throw new Error("category not found");
        }
        const newProduct = new Inventory({
            user_id : userId,
            buyer_id : buyer?._id,
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
        newProduct.save()

        const transaction = new Transaction({
            user_id : userId,
            buyer_id : buyer?._id,
            //worker_id,
            type: "inventory_addition",
            notes : "inventory addition from bot",
            price: total_price, 
            total_shipping: shippingCost?.toFixed(2),
          });
        await transaction.save();

        const transactionItem = new TransactionItem({
            transaction_id: transaction._id,
            inventory_id: newProduct._id,
            user_id : userId,
            buyer_id : buyer?._id,
            qty: qty,
            measurement: 1,
            shipping: avg_shipping.toFixed(2),
            type : "inventory_addition",
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
        await Buyer.findByIdAndUpdate(buyer?._id, { 
            $inc: { currentBalance: -roundBalance } 
        });

        // Create logs for inventory addition
        createlogs({_id : userId}, {
            buyer_id : buyer._id,
            //worker_id,
            type: "inventory_addition",
            transaction_id: transaction?._id,
            amount: (price * qty) + shippingCost,
            description : `${qty} ${unit} of ${productName} added from Bot`,
        });
        return { success: true, data: "ok" };


    },
    {
        name : "add_inventory",
        description : "Add inventory/products item to database",
        schema: z.object({
            buyerName : z.string().describe("Name of the buyer/client"),
            productName: z.string().describe("Name of the product"),
            categoryName: z.string().describe("category of the product"),
            qty: z.string().describe("Quantity of the product"),
            shippingCost: z.string().describe("ShippingCost of the product"),
            unit: z.enum(["pound", "kg", "gram"]).describe("unit of the product"),
            price: z.string().describe("price of the product")
          })
    }
)

export const findInventoryTool = tool(
    async (input: { query?: object }, config) => {
      const userId = config?.configurable?.userId;
      if (!userId) throw new Error("User ID required");
      
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const query = { ...input.query, user_id: userObjectId };
      
      try {
        const results = await mongoose.model('Inventory').find(query);
        return { success: true, data: results };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    {
      name: "find_inventory",
      description: "Find inventory/product items from database. Can search by product name, buyer, or other criteria.",
      schema: z.object({
        query: z.object({}).optional().describe("MongoDB query object to search inventory")
      })
    }
  );
  
  export const findBuyersTool = tool(
    async (input: { query?: object }, config) => {
      const userId = config?.configurable?.userId;
      if (!userId) throw new Error("User ID required");
      
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const query = { ...input.query, user_id: userObjectId };
      
      try {
        const results = await mongoose.model('Buyer').find(query);
        return { success: true, data: results };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    {
      name: "find_buyers",
      description: "Find buyers/clients from database. Can search by name, email, or other criteria.",
      schema: z.object({
        query: z.object({}).optional().describe("MongoDB query object to search buyers")
      })
    }
  );
  
export const findExpensesTool = tool(
    async (input: { query?: object }, config) => {
      const userId = config?.configurable?.userId;
      if (!userId) throw new Error("User ID required");
      
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const query = { ...input.query, user_id: userObjectId };
      
      try {
        const results = await mongoose.model('Expense').find(query);
        return { success: true, data: results };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    {
      name: "find_expenses",
      description: "Find expenses from database. Can search by date range, category, or amount.",
      schema: z.object({
        query: z.object({}).optional().describe("MongoDB query object to search expenses")
      })
    }
  );
  
export const addBuyerTool = tool(
    async (input: { firstName: string; lastName: string; email: string; phone?: string; balance: number }, config) => {
      const userId = config?.configurable?.userId;
      if (!userId) throw new Error("User ID required");
      
      try {
        console.log('addBuyerTool_input',input)
        const newBuyer = new Buyer({
            user_id : userId,
            ...input,
            currentBalance : input?.balance,
            startingBalance: input?.balance
        });
        await newBuyer.save();
        createActivity({
          user_id : userId, 
          //user_created_by: user_created_by_id,
          action: 'create',
          resource_type: 'buyer',
          page: 'buyer',
          type: 'client_created',
          description : `${input.firstName} ${input.lastName} client created`,
        });
        return { success: true, data: "ok" };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    {
      name: "add_buyer",
      description: "Add a new buyer/client to the system.",
      schema: z.object({
        firstName: z.string().describe("First name of the buyer"),
        lastName: z.string().describe("Last name of the buyer"),
        email: z.string().email().describe("Email address of the buyer"),
        phone: z.string().optional().describe("Phone number of the buyer"),
        balance: z.number().describe("Initial balance/outstanding amount for the buyer")
      })
    }
  );
  
export const updateBuyerTool = tool(
    async (input: { identifier: string; firstName?: string; lastName?: string; email?: string; phone?: string; balance?: number },) => {
      try {
        const response = await fetch('https://manapnl.com/api/buyers/aiedit', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        });
        const result = await response.json();
        return { success: response.ok, data: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    {
      name: "update_buyer",
      description: "Update an existing buyer's information.",
      schema: z.object({
        identifier: z.string().describe("Identifier to find the buyer (email, firstName, or lastName)"),
        firstName: z.string().optional().describe("Updated first name"),
        lastName: z.string().optional().describe("Updated last name"),
        email: z.string().email().optional().describe("Updated email address"),
        phone: z.string().optional().describe("Updated phone number"),
        balance: z.number().optional().describe("Updated balance amount")
      })
    }
  );

  export const update_balance_buyer = tool(
    async (input: { firstName?: string; lastName?: string; email?: string; balance: number; type : string,paymentDirection : string,paymentMethod : string },config) => {
      try {
        const {firstName,lastName,email,balance,type,paymentDirection,paymentMethod} = input
        const userId = config.configurable?.userId
        if (!userId) throw new Error("User ID required");

        const buyer: any = await mongoose.model("Buyer").findOne({
            firstName : firstName
        })
        console.log("🙋‍♂️ buyer_found",buyer)
        if(!buyer) {
            throw new Error("Client/Buyer not found");
        }

        const transaction = new Transaction({
            user_id : userId,
            buyer_id : buyer?._id,
            //worker_id,
            type: "inventory_addition",
            notes : "inventory addition from bot",
            payment_direction : paymentDirection,
            payment_method : paymentMethod,

            price: balance, 
          });
        await transaction.save();

        // Create a TransactionPayment record
        const transactionPayment = new TransactionPayment({
            transaction_id: transaction._id,
            buyer_id : buyer?._id,
            amount_paid: balance,
            payment_direction : paymentDirection,
            payment_method: paymentMethod || "unspecified",
            payment_date: new Date(),
        });
        
        await transactionPayment.save();

        // Update buyer's balance based on payment direction
        if (paymentDirection === "received") {
            await Buyer.findByIdAndUpdate(buyer?._id, { 
            $inc: { currentBalance: -balance } 
            });
        } else {
            await Buyer.findByIdAndUpdate(buyer?._id, { 
            $inc: { currentBalance: balance } 
            });
        }
          
        transaction.transactionpayment_id = transactionPayment._id;
        transaction.save();

        // Create logs for inventory addition
        createlogs({_id : userId}, {
            buyer_id : buyer?._id,
            //worker_id,
            transaction_id: transaction?._id,
            type: "payment",
            amount: paymentDirection === "received" ? Number(balance) : -Number(balance),
            payment_method : paymentMethod,
            payment_direction : paymentDirection,
            description: `${balance} ${paymentMethod} ${paymentDirection} ${paymentDirection === "received" ? "from" : "to"} ${firstName + " "}`
          });
        return { success: "success", data: "ok" };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    {
      name: "update_buyer",
      description: "Update an existing buyer's information.",
      schema: z.object({
        firstName: z.string().optional().describe("first name of buyer/client"),
        lastName: z.string().optional().describe("last name of buyer/client"),
        email: z.string().email().optional().describe("email address of buyer/client"),
        balance: z.number().optional().describe("Add balance amount"),
        paymentMethod: z.enum(["cash", "cryto", "eft"]).optional().describe("payment method"),
        paymentDirection : z.string().describe("recieved or given to buyer/client")
      })
    }
  );
  
export const addExpenseTool = tool(
    async (input: { category_name: string; amount: number }, config) => {
      const userId = config?.configurable?.userId;
      if (!userId) throw new Error("User ID required");
      
      try {
        const category = await Category.findOne({
            name: new RegExp(`^${input?.category_name}$`, 'i')
          });
        console.log("🙋‍♂️ category_found",category)
        if(!category) {
            throw new Error("category not found");
        }
        const response = await fetch('https://manapnl.com/api/expense', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            category_id : category?.id,
            ...input
          })
        });
        const result = await response.json();
        return { success: response.ok, data: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    {
      name: "add_expense",
      description: "Add a new expense to the system.",
      schema: z.object({
        category_name: z.string().describe("Category name for the expense (e.g., Marketing, Transport, Packaging)"),
        amount: z.number().positive().describe("Expense amount in dollars")
      })
    }
  );


  // Web Search Tool
 // Web Search Tool - Google Custom Search Version
export const webSearchTool = tool(
  async (input: { query: string; maxResults?: number }) => {
    try {
      const { query, maxResults = 3 } = input;
      console.log(`🔍 Searching Google for: ${query}`);

      // Google Custom Search API credentials (add these to your environment variables)
      const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
      const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

      // Method 1: Try Google Custom Search API
      if (GOOGLE_API_KEY && GOOGLE_SEARCH_ENGINE_ID) {
        try {
          const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${maxResults}`;
          
          const googleResponse = await fetch(googleUrl);
          
          if (googleResponse.ok) {
            const googleData: any = await googleResponse.json();
            
            if (googleData.items && googleData.items.length > 0) {
              const results = googleData.items.map((item: any) => ({
                title: item.title,
                snippet: item.snippet,
                url: item.link,
                source: 'Google Search'
              }));
              
              return {
                success: true,
                query,
                results,
                timestamp: new Date().toISOString()
              };
            }
          }
        } catch (googleError) {
          console.log('Google search failed, trying fallback methods...');
        }
      } else {
        console.log('Google API credentials not found, using fallback methods...');
      }

      // Method 2: Try DuckDuckGo as fallback
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const ddgResponse = await fetch(ddgUrl);
        
        if (ddgResponse.ok) {
          const ddgData: any = await ddgResponse.json();
          
          if (ddgData.Abstract && ddgData.Abstract.length > 0) {
            return {
              success: true,
              query,
              results: [{
                title: ddgData.Heading || 'Answer',
                snippet: ddgData.Abstract,
                url: ddgData.AbstractURL || '',
                source: 'DuckDuckGo'
              }],
              timestamp: new Date().toISOString()
            };
          }
        }
      } catch (ddgError) {
        console.log('DuckDuckGo search failed, trying Wikipedia...');
      }

      // Method 3: Try Wikipedia API for factual information
      try {
        const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const wikiResponse = await fetch(wikiUrl);
        
        if (wikiResponse.ok) {
          const wikiData: any = await wikiResponse.json();
          
          if (wikiData.extract && wikiData.extract.length > 0) {
            return {
              success: true,
              query,
              results: [{
                title: wikiData.title || 'Wikipedia',
                snippet: wikiData.extract,
                url: wikiData.content_urls?.desktop?.page || '',
                source: 'Wikipedia'
              }],
              timestamp: new Date().toISOString()
            };
          }
        }
      } catch (wikiError) {
        console.log('Wikipedia search failed...');
      }

      // Method 4: Return helpful fallback with setup instructions
      return {
        success: true,
        query,
        results: [{
          title: 'Search Setup Required',
          snippet: `To enable Google search, please set up:
          1. Google Custom Search Engine at https://cse.google.com/
          2. Get API key from Google Cloud Console
          3. Add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID to environment variables
          
          For "${query}", try checking official sources or recent news websites directly.`,
          url: 'https://developers.google.com/custom-search/v1/introduction',
          source: 'Setup Instructions'
        }],
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('🔍 Web search error:', error.message);
      return {
        success: false,
        error: `Search failed: ${error.message}`,
        query: input.query,
        results: [{
          title: 'Search Error',
          snippet: `Unable to search for "${input.query}" due to technical issues. Please try again later.`,
          url: '',
          source: 'Error'
        }]
      };
    }
  },
  {
    name: "web_search",
    description: "Search the internet for current information, news, facts, or answers to general questions. Use this when you need up-to-date information or when answering questions outside of business operations.",
    schema: z.object({
      query: z.string().describe("The search query to find information about"),
      maxResults: z.number().optional().describe("Maximum number of results to return (default: 3)")
    })
  }
);
  

