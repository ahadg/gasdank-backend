import { Router, Request, Response } from 'express';
import User from '../models/User';
import { authenticateJWT } from '../middlewares/authMiddleware';
import Transaction from '../models/Transaction';
import TransactionItem from '../models/TransactionItem';
import TransactionPayment from '../models/TransactionPayment';
import Expense from '../models/Expense';
import mongoose from 'mongoose';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure to set this in your environment variables
});

const router = Router();
router.use(authenticateJWT);

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

// GET /api/dashboard/sparkline-data - Get data specifically for sparkline charts
router.get('/sparkline-data', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
             
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    // Get sales and profit data from transactions
    const salesProfitData = await Transaction.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
          type: 'sale',
          created_at: { $gte: last30Days }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$created_at'
            }
          },
          sales: { $sum: '$sale_price' },
          profit: { $sum: '$profit' }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Get expense data from Expense model
    const expenseData = await Expense.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          created_at: { $gte: last30Days }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$created_at'
            }
          },
          expenses: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Create a map for easier data merging
    const salesProfitMap = new Map(
      salesProfitData.map(item => [item._id, { sales: item.sales, profit: item.profit }])
    );
    const expenseMap = new Map(
      expenseData.map(item => [item._id, item.expenses])
    );

    // Get all unique dates and merge data
    const allDates = new Set([
      ...salesProfitData.map(item => item._id),
      ...expenseData.map(item => item._id)
    ]);

    const mergedData = Array.from(allDates)
      .sort()
      .map(date => ({
        date,
        sales: salesProfitMap.get(date)?.sales || 0,
        profit: salesProfitMap.get(date)?.profit || 0,
        expenses: expenseMap.get(date) || 0
      }));

    // Extract arrays for sparkline charts
    const salesData = mergedData.map(item => Math.round(item.sales));
    const profitData = mergedData.map(item => Math.round(item.profit));
    const expensesData = mergedData.map(item => Math.round(item.expenses));

    // Calculate totals
    const totalSales = salesData.reduce((sum, val) => sum + val, 0);
    const totalProfit = profitData.reduce((sum, val) => sum + val, 0);
    const totalExpenses = expensesData.reduce((sum, val) => sum + val, 0);

    res.status(200).json({
      sales: {
        data: salesData,
        total: totalSales
      },
      profit: {
        data: profitData,
        total: totalProfit
      },
      expenses: {
        data: expensesData,
        total: totalExpenses
      }
    });
      
  } catch (error) {
    console.error('Error fetching sparkline data:', error);
    res.status(500).json({ error: 'Failed to fetch sparkline data', details: error });
  }
});

// GET /api/dashboard/monthly-revenue - Get monthly revenue data for bar chart
router.get('/monthly-revenue', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate, product } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Build match conditions
    const matchConditions: any = {
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null,
      type: 'sale'
    };

    // Add date filters if provided
    if (startDate || endDate) {
      matchConditions.created_at = {};
      if (startDate) matchConditions.created_at.$gte = new Date(startDate as string);
      if (endDate) matchConditions.created_at.$lte = new Date(endDate as string);
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: matchConditions },
      {
        $group: {
          _id: {
            year: { $year: '$created_at' },
            month: { $month: '$created_at' }
          },
          revenue: { $sum: '$sale_price' },
          profit: { $sum: '$profit' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ];

    // If product filter is specified, need to join with TransactionItem
    if (product && product !== '') {
      pipeline.unshift(
        {
          $lookup: {
            from: 'transactionitems',
            localField: '_id',
            foreignField: 'transaction_id',
            as: 'items'
          }
        },
        {
          $match: {
            'items.inventory_id': new mongoose.Types.ObjectId(product as string)
          }
        }
      );
    }

    const monthlyData = await Transaction.aggregate(pipeline);

    // Format data for frontend
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedData = monthlyData.map(item => ({
      month: months[item._id.month - 1],
      year: item._id.year,
      revenue: Math.round(item.revenue),
      profit: Math.round(item.profit),
      count: item.count
    }));

    res.status(200).json({
      data: formattedData,
      chartData: formattedData.map(item => item.revenue),
      categories: formattedData.map(item => item.month)
    });

  } catch (error) {
    console.error('Error fetching monthly revenue:', error);
    res.status(500).json({ error: 'Failed to fetch monthly revenue', details: error });
  }
});

// GET /api/dashboard/top-categories - Get top categories by revenue
router.get('/top-categories', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate, limit = 10 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Build match conditions for TransactionItem
    const matchConditions: any = {
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null,
      type: 'sale'
    };

    // Add date filters if provided
    if (startDate || endDate) {
      matchConditions.created_at = {};
      if (startDate) matchConditions.created_at.$gte = new Date(startDate as string);
      if (endDate) matchConditions.created_at.$lte = new Date(endDate as string);
    }

    const topCategories = await TransactionItem.aggregate([
      { $match: matchConditions },
      {
        $lookup: {
          from: 'inventories',
          localField: 'inventory_id',
          foreignField: '_id',
          as: 'inventory'
        }
      },
      { $unwind: '$inventory' },
      {
        $lookup: {
          from: 'categories', // Assuming your category collection name
          localField: 'inventory.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$category._id',
          categoryName: { $first: '$category.name' },
          totalRevenue: { $sum: { $multiply: ['$sale_price', '$qty'] } },
          totalProfit: { $sum: '$profit' },
          totalQuantity: { $sum: '$qty' },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit as string) }
    ]);

    // Calculate total revenue for percentage calculation
    const totalRevenue = topCategories.reduce((sum, cat) => sum + cat.totalRevenue, 0);

    // Format data with percentages
    const formattedCategories = topCategories.map(category => ({
      _id: category._id,
      name: category.categoryName,
      revenue: Math.round(category.totalRevenue),
      profit: Math.round(category.totalProfit),
      quantity: category.totalQuantity,
      transactionCount: category.transactionCount,
      percentage: Math.round((category.totalRevenue / totalRevenue) * 100)
    }));

    res.status(200).json({
      categories: formattedCategories,
      totalRevenue: Math.round(totalRevenue)
    });

  } catch (error) {
    console.error('Error fetching top categories:', error);
    res.status(500).json({ error: 'Failed to fetch top categories', details: error });
  }
});

// GET /api/dashboard/top-products - Get top selling products
router.get('/top-products', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate, limit = 10 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Build match conditions
    const matchConditions: any = {
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null,
      type: 'sale'
    };

    // Add date filters if provided
    if (startDate || endDate) {
      matchConditions.created_at = {};
      if (startDate) matchConditions.created_at.$gte = new Date(startDate as string);
      if (endDate) matchConditions.created_at.$lte = new Date(endDate as string);
    }

    const topProducts = await TransactionItem.aggregate([
      { $match: matchConditions },
      {
        $lookup: {
          from: 'inventories',
          localField: 'inventory_id',
          foreignField: '_id',
          as: 'inventory'
        }
      },
      { $unwind: '$inventory' },
      {
        $group: {
          _id: '$inventory_id',
          productName: { $first: '$inventory.name' },
          productSku: { $first: '$inventory.sku' },
          totalRevenue: { $sum: { $multiply: ['$sale_price', '$qty'] } },
          totalProfit: { $sum: '$profit' },
          totalQuantity: { $sum: '$qty' },
          transactionCount: { $sum: 1 },
          avgPrice: { $avg: '$sale_price' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit as string) }
    ]);

    // Format data
    const formattedProducts = topProducts.map(product => ({
      _id: product._id,
      name: product.productName,
      sku: product.productSku,
      revenue: Math.round(product.totalRevenue),
      profit: Math.round(product.totalProfit),
      quantity: product.totalQuantity,
      transactionCount: product.transactionCount,
      avgPrice: Math.round(product.avgPrice * 100) / 100
    }));

    res.status(200).json({
      products: formattedProducts
    });

  } catch (error) {
    console.error('Error fetching top products:', error);
    res.status(500).json({ error: 'Failed to fetch top products', details: error });
  }
});

// GET /api/dashboard/top-clients - Get top clients by sales
router.get('/top-clients', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate, product, limit = 10 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Build match conditions
    const matchConditions: any = {
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null,
      type: 'sale'
    };

    // Add date filters if provided
    if (startDate || endDate) {
      matchConditions.created_at = {};
      if (startDate) matchConditions.created_at.$gte = new Date(startDate as string);
      if (endDate) matchConditions.created_at.$lte = new Date(endDate as string);
    }

    let pipeline: any[] = [
      { $match: matchConditions }
    ];

    // If product filter is specified, join with TransactionItem
    if (product && product !== '') {
      pipeline.push(
        {
          $lookup: {
            from: 'transactionitems',
            localField: '_id',
            foreignField: 'transaction_id',
            as: 'items'
          }
        },
        {
          $match: {
            'items.inventory_id': new mongoose.Types.ObjectId(product as string)
          }
        }
      );
    }

    pipeline.push(
      {
        $lookup: {
          from: 'buyers',
          localField: 'buyer_id',
          foreignField: '_id',
          as: 'buyer'
        }
      },
      { $unwind: '$buyer' },
      {
        $group: {
          _id: '$buyer_id',
          clientName: { $first: '$buyer.name' },
          clientEmail: { $first: '$buyer.email' },
          clientPhone: { $first: '$buyer.phone' },
          totalSales: { $sum: '$sale_price' },
          totalProfit: { $sum: '$profit' },
          transactionCount: { $sum: 1 },
          lastTransactionDate: { $max: '$created_at' }
        }
      },
      { $sort: { totalSales: -1 } },
      { $limit: parseInt(limit as string) }
    );

    const topClients = await Transaction.aggregate(pipeline);

    // Format data
    const formattedClients = topClients.map(client => ({
      _id: client._id,
      name: client.clientName,
      email: client.clientEmail,
      phone: client.clientPhone,
      sales: Math.round(client.totalSales),
      profit: Math.round(client.totalProfit),
      transactionCount: client.transactionCount,
      lastTransactionDate: client.lastTransactionDate
    }));

    res.status(200).json({
      clients: formattedClients
    });

  } catch (error) {
    console.error('Error fetching top clients:', error);
    res.status(500).json({ error: 'Failed to fetch top clients', details: error });
  }
});

// GET /api/dashboard/payment-types - Get payment types data
router.get('/payment-types', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Build match conditions for transactions
    const matchConditions: any = {
      user_id: new mongoose.Types.ObjectId(userId),
      payment_direction: 'received',
      type: 'payment' // Based on your screenshot, transactions have type: 'payment'
    };

    // Add date filters if provided
    if (startDate || endDate) {
      matchConditions.created_at = {};
      if (startDate) matchConditions.created_at.$gte = new Date(startDate as string);
      if (endDate) matchConditions.created_at.$lte = new Date(endDate as string);
    }

    const paymentTypesData = await Transaction.aggregate([
      {
        $match: matchConditions
      },
      {
        $group: {
          _id: '$payment_method',
          totalAmount: { $sum: '$price' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ]);

    // Calculate total payments for percentage calculation
    const totalPayments = paymentTypesData.reduce((sum, payment) => sum + payment.totalAmount, 0);

    // Format data with percentages
    const formattedPaymentTypes = paymentTypesData.map(payment => ({
      name: payment._id,
      amount: Math.round(payment.totalAmount),
      count: payment.count,
      percentage: totalPayments > 0 ? Math.round((payment.totalAmount / totalPayments) * 100) : 0
    }));

    res.status(200).json({
      paymentTypes: formattedPaymentTypes,
      totalPayments: Math.round(totalPayments)
    });

  } catch (error) {
    console.error('Error fetching payment types:', error);
    res.status(500).json({ error: 'Failed to fetch payment types', details: error });
  }
});

// GET /api/dashboard/forecasting - Enhanced forecasting with product-level insights (Last 3 months)
router.get('/forecasting', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { months = 3 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const forecastMonths = parseInt(months as string);
    // Changed from 12 months to 3 months
    const last3Months = new Date();
    last3Months.setMonth(last3Months.getMonth() - 3);

    // Get recent sales data for proper trend analysis (last 3 months only)
    const recentSales = await Transaction.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
          type: 'sale',
          created_at: { $gte: last3Months }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$created_at' },
            month: { $month: '$created_at' }
          },
          revenue: { $sum: '$sale_price' },
          profit: { $sum: '$profit' },
          transactions: { $sum: 1 },
          date: { $first: '$created_at' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Get product sales for inventory suggestions (last 3 months only)
    const productSales = await Transaction.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
          type: 'sale',
          created_at: { $gte: last3Months }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'product_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $group: {
          _id: '$product_id',
          productName: { $first: '$product.name' },
          totalSold: { $sum: '$quantity' },
          revenue: { $sum: '$sale_price' },
          currentStock: { $first: '$product.stock' },
          avgMonthlySales: { $avg: '$quantity' }
        }
      },
      {
        $sort: { totalSold: -1 }
      },
      { $limit: 10 }
    ]);

    // Helper function to calculate linear regression
    const calculateLinearRegression = (xValues: number[], yValues: number[]) => {
      const n = xValues.length;
      if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 };

      const sumX = xValues.reduce((a, b) => a + b, 0);
      const sumY = yValues.reduce((a, b) => a + b, 0);
      const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
      const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
      const sumYY = yValues.reduce((sum, y) => sum + y * y, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Calculate R-squared for confidence
      const yMean = sumY / n;
      const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
      const ssResidual = yValues.reduce((sum, y, i) => {
        const predicted = slope * xValues[i] + intercept;
        return sum + Math.pow(y - predicted, 2);
      }, 0);
      const rSquared = ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);

      return { slope: isNaN(slope) ? 0 : slope, intercept: isNaN(intercept) ? 0 : intercept, rSquared: Math.max(0, rSquared) };
    };

    // Helper function for exponential smoothing
    const exponentialSmoothing = (data: number[], alpha: number = 0.3) => {
      if (data.length === 0) return 0;
      if (data.length === 1) return data[0];

      let smoothed = data[0];
      for (let i = 1; i < data.length; i++) {
        smoothed = alpha * data[i] + (1 - alpha) * smoothed;
      }
      return smoothed;
    };

    // Updated seasonal detection for 3-month periods
    const detectSeasonality = (data: number[]) => {
      if (data.length < 3) return { seasonal: false, factor: 1 };
      
      // Simple seasonal detection for 3-month data
      const avgValue = data.reduce((a, b) => a + b, 0) / data.length;
      const variance = data.reduce((sum, val) => sum + Math.pow(val - avgValue, 2), 0) / data.length;
      const coefficient = avgValue > 0 ? Math.sqrt(variance) / avgValue : 0;

      return {
        seasonal: coefficient > 0.15,
        factor: Math.max(0.85, Math.min(1.15, 1 + (coefficient / 3)))
      };
    };

    // Updated forecast calculation for 3-month data
    const calculateRealisticForecast = (historicalData: number[], metric: string) => {
      if (historicalData.length === 0) {
        return { 
          values: new Array(forecastMonths).fill(0), 
          confidence: 10,
          method: 'no_data'
        };
      }

      // Filter out zero values for better analysis
      const nonZeroData = historicalData.filter(val => val > 0);
      if (nonZeroData.length === 0) {
        return { 
          values: new Array(forecastMonths).fill(0), 
          confidence: 10,
          method: 'no_sales'
        };
      }

      const xValues = nonZeroData.map((_, index) => index + 1);
      const yValues = nonZeroData;

      // Method 1: Linear Regression
      const regression = calculateLinearRegression(xValues, yValues);
      
      // Method 2: Exponential Smoothing
      const smoothedValue = exponentialSmoothing(yValues);
      
      // Method 3: Moving Average (use all available data for 3-month period)
      const movingAverage = yValues.reduce((a, b) => a + b, 0) / yValues.length;

      // Detect seasonality
      const seasonality = detectSeasonality(yValues);

      // Combine methods with weights based on data quality (adjusted for 3-month data)
      const dataQuality = Math.min(1, nonZeroData.length / 3);
      const regressionWeight = Math.max(0.3, regression.rSquared * dataQuality);
      const smoothingWeight = 0.4;
      const movingAvgWeight = 1 - regressionWeight - smoothingWeight;

      const forecasts = [];
      for (let i = 1; i <= forecastMonths; i++) {
        // Linear regression prediction
        const regPrediction = regression.slope * (nonZeroData.length + i) + regression.intercept;
        
        // Exponential smoothing prediction (with slight decay for realism)
        const smoothPrediction = smoothedValue * Math.pow(0.98, i - 1);
        
        // Moving average prediction (with trend adjustment)
        const trendAdjustment = (regression.slope * i) / 2;
        const maPrediction = movingAverage + trendAdjustment;

        // Weighted combination
        let combinedPrediction = (
          regPrediction * regressionWeight +
          smoothPrediction * smoothingWeight +
          maPrediction * movingAvgWeight
        );

        // Apply seasonal adjustment (less aggressive for 3-month data)
        if (seasonality.seasonal) {
          const monthIndex = (new Date().getMonth() + i) % 12;
          const seasonalMultiplier = seasonality.factor * (1 + 0.05 * Math.sin((monthIndex / 12) * 2 * Math.PI));
          combinedPrediction *= seasonalMultiplier;
        }

        // Apply realistic constraints
        combinedPrediction = Math.max(0, combinedPrediction);
        
        // Add some randomness/uncertainty for distant forecasts (reduced for shorter baseline)
        const uncertainty = 1 + (0.08 * i * Math.random() - 0.04 * i);
        combinedPrediction *= uncertainty;

        forecasts.push(Math.round(combinedPrediction));
      }

      // Calculate confidence based on data quality and model fit (adjusted for 3-month data)
      let confidence = Math.round(
        (regression.rSquared * 50 + dataQuality * 25 + 35)
      );
      confidence = Math.max(20, Math.min(75, confidence));

      return {
        values: forecasts,
        confidence,
        method: nonZeroData.length >= 2 ? 'hybrid' : 'simple',
        rSquared: regression.rSquared,
        seasonality: seasonality.seasonal
      };
    };

    // Process historical data into time series
    interface MonthlyDataItem {
      revenue: number;
      profit: number;
      transactions: number;
      year: number;
      month: number;
    }

    // Fill missing months with zeros for complete time series (last 3 months only)
    const monthlyData: { [key: string]: MonthlyDataItem } = {};
    const currentDate = new Date();
    
    // Initialize last 3 months with zero
    for (let i = 2; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      monthlyData[key] = {
        revenue: 0,
        profit: 0,
        transactions: 0,
        year: date.getFullYear(),
        month: date.getMonth() + 1
      };
    }

    // Fill in actual data
    recentSales.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      if (monthlyData[key]) {
        monthlyData[key] = {
          revenue: item.revenue,
          profit: item.profit,
          transactions: item.transactions,
          year: item._id.year,
          month: item._id.month
        };
      }
    });

    const monthlyArray = Object.values(monthlyData).sort((a, b) => 
      a.year - b.year || a.month - b.month
    );

    const revenueData = monthlyArray.map(item => item.revenue);
    const profitData = monthlyArray.map(item => item.profit);
    const transactionData = monthlyArray.map(item => item.transactions);

    // Generate realistic forecasts
    const revenueForecast = calculateRealisticForecast(revenueData, 'revenue');
    const profitForecast = calculateRealisticForecast(profitData, 'profit');
    const transactionForecast = calculateRealisticForecast(transactionData, 'transactions');

    // Generate forecast periods
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    interface ForecastItem {
      month: string;
      year: number;
      predictedRevenue: number;
      predictedProfit: number;
      predictedTransactions: number;
      confidence: number;
      avgOrderValue: number;
    }
    const forecasts: ForecastItem[] = [];
    const today = new Date();

    for (let i = 1; i <= forecastMonths; i++) {
      const futureDate = new Date(today);
      futureDate.setMonth(today.getMonth() + i);
      
      const predictedRevenue = revenueForecast.values[i - 1] || 0;
      const predictedProfit = profitForecast.values[i - 1] || 0;
      const predictedTransactions = transactionForecast.values[i - 1] || 0;

      // Calculate realistic confidence (average of all metrics)
      const avgConfidence = Math.round(
        (revenueForecast.confidence + profitForecast.confidence + transactionForecast.confidence) / 3
      );

      forecasts.push({
        month: monthNames[futureDate.getMonth()],
        year: futureDate.getFullYear(),
        predictedRevenue,
        predictedProfit,
        predictedTransactions,
        confidence: Math.max(20, avgConfidence - (i * 3)),
        avgOrderValue: predictedTransactions > 0 ? Math.round(predictedRevenue / predictedTransactions) : 0
      });
    }

    // Realistic product forecasts (based on 3-month data)
    interface ProductForecast {
      name: string;
      currentStock: number;
      predictedMonthlySales: number;
      avgMonthlySales: number;
      daysOfStock: number;
      suggestedOrderQuantity: number;
      priority: 'high' | 'moderate' | 'low';
      confidence: number;
      potentialRevenue: number;
    }

    const productForecasts: { [key: string]: ProductForecast } = {};
    productSales.forEach(product => {
      const monthlySales = Math.max(0, Math.ceil(product.avgMonthlySales));
      
      let predictedSales = monthlySales;
      let confidence = 40;

      if (monthlySales > 0) {
        // Apply small realistic growth/decline
        const randomFactor = 0.85 + (Math.random() * 0.3);
        predictedSales = Math.round(monthlySales * randomFactor);
        confidence = Math.min(70, 30 + (monthlySales * 2));
      }

      const daysOfStock = monthlySales > 0 ? Math.round(product.currentStock / (monthlySales / 30)) : 999;
      const avgOrderValue = product.totalSold > 0 ? product.revenue / product.totalSold : 0;
      
      productForecasts[product._id.toString()] = {
        name: product.productName,
        currentStock: product.currentStock,
        predictedMonthlySales: predictedSales,
        avgMonthlySales: monthlySales,
        daysOfStock,
        suggestedOrderQuantity: Math.max(predictedSales * 1.3, 3),
        priority: daysOfStock < 14 ? 'high' : daysOfStock < 45 ? 'moderate' : 'low',
        confidence,
        potentialRevenue: Math.round(predictedSales * avgOrderValue)
      };
    });

    // Calculate realistic market metrics (3-month data)
    const totalRevenue = revenueData.reduce((sum, val) => sum + val, 0);
    const totalProfit = profitData.reduce((sum, val) => sum + val, 0);
    const totalTransactions = transactionData.reduce((sum, val) => sum + val, 0);
    
    const marketMetrics = {
      customerLifetimeValue: totalTransactions > 0 ? Math.round((totalRevenue / totalTransactions) * 2.5) : 0,
      inventoryTurnover: totalRevenue > 0 ? Math.round((totalRevenue / Math.max(500, totalRevenue * 0.6)) * 10) / 10 : 0,
      profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 10) / 10 : 0,
      averageOrderValue: totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0
    };

    // Calculate growth rate based on 3-month periods
    const firstMonthRevenue = revenueData[0] || 0;
    const lastMonthRevenue = revenueData[revenueData.length - 1] || 0;
    const growthRate = firstMonthRevenue > 0 ? Math.round(((lastMonthRevenue - firstMonthRevenue) / firstMonthRevenue) * 100) : 0;

    res.status(200).json({
      forecasts,
      historicalData: monthlyArray.map(item => ({
        month: monthNames[item.month - 1],
        year: item.year,
        revenue: item.revenue,
        profit: item.profit,
        transactions: item.transactions
      })),
      productForecasts,
      marketMetrics,
      summary: {
        totalPredictedRevenue: forecasts.reduce((sum, f) => sum + f.predictedRevenue, 0),
        totalPredictedTransactions: forecasts.reduce((sum, f) => sum + f.predictedTransactions, 0),
        avgConfidence: Math.round(forecasts.reduce((sum, f) => sum + f.confidence, 0) / Math.max(1, forecasts.length)),
        growthRate,
        nextMonthRevenue: forecasts[0]?.predictedRevenue || 0,
        methodology: {
          dataPoints: monthlyArray.length,
          forecastMethod: revenueForecast.method,
          seasonalityDetected: revenueForecast.seasonality,
          modelAccuracy: Math.round((revenueForecast.rSquared || 0) * 100),
          analysisWindow: "3 months"
        }
      }
    });

  } catch (error) {
    console.error('Error fetching forecasting data:', error);
    res.status(500).json({ error: 'Failed to fetch forecasting data' });
  }
});

// GET /api/dashboard/low-stock-products - Get products that might need restocking
router.get('/low-stock-products', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    // Get products with their current stock and recent sales velocity
    const stockAnalysis = await TransactionItem.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
          type: 'sale',
          created_at: { $gte: last30Days }
        }
      },
      {
        $lookup: {
          from: 'inventories',
          localField: 'inventory_id',
          foreignField: '_id',
          as: 'inventory'
        }
      },
      { $unwind: '$inventory' },
      {
        $group: {
          _id: '$inventory_id',
          productName: { $first: '$inventory.name' },
          currentStock: { $first: '$inventory.qty_in_stock' },
          soldQuantity: { $sum: '$qty' },
          totalRevenue: { $sum: { $multiply: ['$sale_price', '$qty'] } },
          avgSalePrice: { $avg: '$sale_price' }
        }
      },
      {
        $addFields: {
          dailyVelocity: { $divide: ['$soldQuantity', 30] },
          daysOfStock: {
            $cond: {
              if: { $gt: ['$dailyVelocity', 0] },
              then: { $divide: ['$currentStock', '$dailyVelocity'] },
              else: null
            }
          },
          reorderSuggestion: {
            $cond: {
              if: { $lt: [{ $divide: ['$currentStock', '$dailyVelocity'] }, 14] },
              then: 'urgent',
              else: {
                $cond: {
                  if: { $lt: [{ $divide: ['$currentStock', '$dailyVelocity'] }, 30] },
                  then: 'moderate',
                  else: 'low'
                }
              }
            }
          }
        }
      },
      {
        $match: {
          $or: [
            { currentStock: { $lte: 10 } },
            { daysOfStock: { $lte: 30 } }
          ]
        }
      },
      { $sort: { daysOfStock: 1 } },
      { $limit: 20 }
    ]);

    const formattedStockAnalysis = stockAnalysis.map(item => ({
      _id: item._id,
      name: item.productName,
      currentStock: item.currentStock,
      soldLast30Days: item.soldQuantity,
      dailyVelocity: Math.round(item.dailyVelocity * 100) / 100,
      daysOfStock: item.daysOfStock ? Math.round(item.daysOfStock) : null,
      reorderPriority: item.reorderSuggestion,
      suggestedOrderQuantity: Math.max(30, Math.round(item.dailyVelocity * 60)), // 60 days worth
      revenue: Math.round(item.totalRevenue),
      avgPrice: Math.round(item.avgSalePrice * 100) / 100
    }));

    res.status(200).json({
      lowStockProducts: formattedStockAnalysis
    });

  } catch (error) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products', details: error });
  }
});


// POST /api/dashboard/ai-suggestions - Get AI-powered business suggestions
router.post('/ai-suggestions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get business data for AI analysis
    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);

    const [topProducts, topCategories, recentTrends, lowStock, totalRevenue, transactionCount] = await Promise.all([
      // Top products
      TransactionItem.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            deleted_at: null,
            type: 'sale',
            created_at: { $gte: last90Days }
          }
        },
        {
          $lookup: {
            from: 'inventories',
            localField: 'inventory_id',
            foreignField: '_id',
            as: 'inventory'
          }
        },
        { $unwind: '$inventory' },
        {
          $group: {
            _id: '$inventory_id',
            name: { $first: '$inventory.name' },
            revenue: { $sum: { $multiply: ['$sale_price', '$qty'] } },
            quantity: { $sum: '$qty' },
            avgPrice: { $avg: '$sale_price' }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 }
      ]),

      // Top categories
      TransactionItem.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            deleted_at: null,
            type: 'sale',
            created_at: { $gte: last90Days }
          }
        },
        {
          $lookup: {
            from: 'inventories',
            localField: 'inventory_id',
            foreignField: '_id',
            as: 'inventory'
          }
        },
        { $unwind: '$inventory' },
        {
          $lookup: {
            from: 'categories',
            localField: 'inventory.category',
            foreignField: '_id',
            as: 'category'
          }
        },
        { $unwind: '$category' },
        {
          $group: {
            _id: '$category._id',
            name: { $first: '$category.name' },
            revenue: { $sum: { $multiply: ['$sale_price', '$qty'] } },
            quantity: { $sum: '$qty' }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 }
      ]),

      // Monthly trends (extended to 6 months for better analysis)
      Transaction.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            deleted_at: null,
            type: 'sale',
            created_at: { 
              $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) // 6 months
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$created_at' },
              month: { $month: '$created_at' }
            },
            revenue: { $sum: '$sale_price' },
            transactions: { $sum: 1 },
            avgTransactionValue: { $avg: '$sale_price' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Low stock items
      TransactionItem.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            deleted_at: null,
            type: 'sale',
            created_at: { $gte: last90Days }
          }
        },
        {
          $lookup: {
            from: 'inventories',
            localField: 'inventory_id',
            foreignField: '_id',
            as: 'inventory'
          }
        },
        { $unwind: '$inventory' },
        {
          $group: {
            _id: '$inventory_id',
            name: { $first: '$inventory.name' },
            currentStock: { $first: '$inventory.qty_in_stock' },
            soldQuantity: { $sum: '$qty' },
            revenue: { $sum: { $multiply: ['$sale_price', '$qty'] } }
          }
        },
        {
          $match: {
            $expr: {
              $or: [
                { $lt: ['$currentStock', 10] }, // Less than 10 items in stock
                { $lt: ['$currentStock', { $multiply: ['$soldQuantity', 0.3] }] } // Less than 30% of recent sales
              ]
            }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 8 }
      ]),

      // Total revenue for context
      Transaction.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            deleted_at: null,
            type: 'sale',
            created_at: { $gte: last90Days }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$sale_price' },
            avgOrderValue: { $avg: '$sale_price' }
          }
        }
      ]),

      // Transaction count
      Transaction.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        type: 'sale',
        created_at: { $gte: last90Days }
      })
    ]);

    // Create comprehensive business context for AI
    const businessContext = {
      timeframe: "Last 90 days",
      totalRevenue: totalRevenue[0]?.totalRevenue || 0,
      avgOrderValue: totalRevenue[0]?.avgOrderValue || 0,
      transactionCount: transactionCount,
      topProducts: topProducts.map(p => ({
        name: p.name,
        revenue: p.revenue,
        quantity: p.quantity,
        avgPrice: p.avgPrice
      })),
      topCategories: topCategories.map(c => ({
        name: c.name,
        revenue: c.revenue,
        quantity: c.quantity
      })),
      monthlyTrends: recentTrends.map(t => ({
        month: `${t._id.month}/${t._id.year}`,
        revenue: t.revenue,
        transactions: t.transactions,
        avgTransactionValue: t.avgTransactionValue
      })),
      lowStockItems: lowStock.map(s => ({
        name: s.name,
        currentStock: s.currentStock,
        soldQuantity: s.soldQuantity,
        revenue: s.revenue
      }))
    };

    // Generate AI suggestions using OpenAI
    let suggestions;
    try {
      suggestions = await generateAISuggestions(businessContext);
    } catch (aiError) {
      console.warn('AI generation failed, falling back to rule-based suggestions:', aiError);
      // Fallback to rule-based suggestions if AI fails
      suggestions = generateBusinessSuggestions(businessContext);
    }

    res.status(200).json({
      suggestions,
      dataAnalyzed: {
        productsAnalyzed: topProducts.length,
        categoriesAnalyzed: topCategories.length,
        monthsOfData: recentTrends.length,
        lowStockItems: lowStock.length,
        totalRevenue: businessContext.totalRevenue,
        transactionCount: businessContext.transactionCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    res.status(500).json({ 
      error: 'Failed to generate AI suggestions', 
      details: process.env.NODE_ENV === 'development' ? error : 'Internal server error'
    });
  }
});

// AI-powered suggestion generation using OpenAI GPT
async function generateAISuggestions(context: any) {
  const prompt = `You are a business analytics expert. Based on the following business data, provide 4-6 actionable business suggestions. 

Business Data:
- Timeframe: ${context.timeframe}
- Total Revenue: $${context.totalRevenue.toFixed(2)}
- Average Order Value: $${context.avgOrderValue.toFixed(2)}
- Total Transactions: ${context.transactionCount}

Top Products (by revenue):
${context.topProducts.slice(0, 5).map((p: { name: string; revenue: number; quantity: number; avgPrice: number }) => `- ${p.name}: $${p.revenue.toFixed(2)} revenue, ${p.quantity} units sold, avg $${p.avgPrice.toFixed(2)} per unit`).join('\n')}

Top Categories:
${context.topCategories.map((c: { name: string; revenue: number; quantity: number }) => `- ${c.name}: $${c.revenue.toFixed(2)} revenue, ${c.quantity} units sold`).join('\n')}

Monthly Revenue Trends:
${context.monthlyTrends.map((t: { month: string; revenue: number; transactions: number }) => `- ${t.month}: $${t.revenue.toFixed(2)} revenue, ${t.transactions} transactions`).join('\n')}

Low Stock Items:
${context.lowStockItems.map((s: { name: string; currentStock: number; soldQuantity: number; revenue: number }) => `- ${s.name}: ${s.currentStock} in stock, ${s.soldQuantity} sold recently ($${s.revenue.toFixed(2)} revenue)`).join('\n')}

Please provide suggestions in the following JSON format:
[
  {
    "type": "inventory|product|category|trend|marketing|pricing|general",
    "priority": "high|medium|low",
    "title": "Brief suggestion title",
    "description": "Detailed explanation of the opportunity or issue",
    "action": "Specific actionable step to take",
    "impact": "Expected business impact"
  }
]

Focus on actionable, data-driven insights that can directly improve revenue, reduce costs, or optimize operations. Consider inventory management, product performance, pricing optimization, marketing opportunities, and operational efficiency.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using the more cost-effective model
      messages: [
        {
          role: "system",
          content: "You are a business analytics expert who provides actionable, data-driven business insights. Always respond with valid JSON format."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });

    const aiResponse = response.choices[0].message.content;
    
    // Parse the AI response
    let parsedSuggestions;
    try {
      // Clean the response to extract JSON
      const jsonMatch = aiResponse?.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;
      parsedSuggestions = JSON.parse(jsonString || '[]');
    } catch (parseError) {
      console.warn('Failed to parse AI response, using fallback:', parseError);
      throw new Error('AI response parsing failed');
    }

    // Validate and sanitize suggestions
    const validatedSuggestions = parsedSuggestions
      .filter((s: any) => s.title && s.description && s.action && s.impact)
      .map((s: any) => ({
        type: s.type || 'general',
        priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
        title: s.title.substring(0, 100), // Limit title length
        description: s.description.substring(0, 300), // Limit description length
        action: s.action.substring(0, 200), // Limit action length
        impact: s.impact.substring(0, 200) // Limit impact length
      }))
      .slice(0, 6); // Limit to 6 suggestions

    return validatedSuggestions.length > 0 ? validatedSuggestions : generateBusinessSuggestions(context);

  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}

// Enhanced fallback function for rule-based suggestions
function generateBusinessSuggestions(context: any) {
  const suggestions = [];

  // Calculate growth rate if we have trend data
  let growthRate = 0;
  if (context.monthlyTrends.length >= 2) {
    const latest = context.monthlyTrends[context.monthlyTrends.length - 1];
    const previous = context.monthlyTrends[context.monthlyTrends.length - 2];
    if (latest && previous && previous.revenue > 0) {
      growthRate = ((latest.revenue - previous.revenue) / previous.revenue) * 100;
    }
  }

  // High priority: Inventory management
  if (context.lowStockItems.length > 0) {
    const totalLowStockRevenue = context.lowStockItems.reduce((sum: number, item: { revenue: number }) => sum + item.revenue, 0);
    suggestions.push({
      type: 'inventory',
      priority: 'high',
      title: 'Critical Stock Replenishment Required',
      description: `${context.lowStockItems.length} high-performing products are critically low on stock, representing $${totalLowStockRevenue.toFixed(2)} in recent revenue. Risk of stockouts could impact sales.`,
      action: `Immediately reorder: ${context.lowStockItems.slice(0, 3).map((item: { name: string }) => item.name).join(', ')}`,
      impact: `Prevent potential revenue loss of $${(totalLowStockRevenue * 0.3).toFixed(2)} monthly`
    });
  }

  // Revenue trend analysis
  if (growthRate < -10) {
    suggestions.push({
      type: 'trend',
      priority: 'high',
      title: 'Revenue Decline Intervention Needed',
      description: `Sales have declined by ${Math.abs(growthRate).toFixed(1)}% compared to last month. Immediate action required to reverse the trend.`,
      action: 'Launch targeted marketing campaign and review pricing strategy',
      impact: 'Stabilize revenue and regain growth momentum'
    });
  } else if (growthRate > 15) {
    suggestions.push({
      type: 'trend',
      priority: 'medium',
      title: 'Capitalize on Growth Momentum',
      description: `Excellent growth of ${growthRate.toFixed(1)}% last month! This is the perfect time to scale successful strategies.`,
      action: 'Increase inventory for top products and expand marketing budget',
      impact: 'Accelerate growth while market conditions are favorable'
    });
  }

  // Product performance optimization
  if (context.topProducts.length > 0) {
    const topProduct = context.topProducts[0];
    const revenueShare = (topProduct.revenue / context.totalRevenue) * 100;
    
    if (revenueShare > 30) {
      suggestions.push({
        type: 'product',
        priority: 'medium',
        title: 'Diversify Revenue Sources',
        description: `${topProduct.name} generates ${revenueShare.toFixed(1)}% of total revenue. High dependency on single product creates risk.`,
        action: 'Develop complementary products and cross-selling strategies',
        impact: 'Reduce business risk and create multiple revenue streams'
      });
    } else {
      suggestions.push({
        type: 'product',
        priority: 'medium',
        title: 'Scale Top Performers',
        description: `Your top products are generating consistent revenue. Consider expanding these successful product lines.`,
        action: `Increase marketing spend on top 3 products: ${context.topProducts.slice(0, 3).map((p: { name: string }) => p.name).join(', ')}`,
        impact: `Potential revenue increase of $${(context.topProducts.slice(0, 3).reduce((sum: number, p: { revenue: number }) => sum + p.revenue, 0) * 0.2).toFixed(2)} monthly`
      });
    }
  }

  // Category performance
  if (context.topCategories.length > 0) {
    const topCategory = context.topCategories[0];
    suggestions.push({
      type: 'category',
      priority: 'medium',
      title: 'Category Expansion Opportunity',
      description: `${topCategory.name} is your strongest category with $${topCategory.revenue.toFixed(2)} revenue. Consider expanding product variety in this category.`,
      action: 'Research and add 2-3 complementary products in this category',
      impact: 'Increase category revenue by 25-40% within 3 months'
    });
  }

  // Pricing optimization
  if (context.avgOrderValue < 50) {
    suggestions.push({
      type: 'pricing',
      priority: 'medium',
      title: 'Increase Average Order Value',
      description: `Current average order value is $${context.avgOrderValue.toFixed(2)}. There's opportunity to increase transaction values.`,
      action: 'Implement bundle offers, upselling, and minimum order incentives',
      impact: `Increase monthly revenue by $${(context.transactionCount * 10).toFixed(2)} with just $10 AOV increase`
    });
  }

  // Marketing efficiency
  const dailyTransactions = context.transactionCount / 90;
  if (dailyTransactions < 5) {
    suggestions.push({
      type: 'marketing',
      priority: 'high',
      title: 'Boost Customer Acquisition',
      description: `With ${dailyTransactions.toFixed(1)} daily transactions, there's significant room to increase customer volume.`,
      action: 'Invest in digital marketing, referral programs, and local advertising',
      impact: 'Double daily transactions within 60 days'
    });
  }

  // General optimization
  suggestions.push({
    type: 'general',
    priority: 'low',
    title: 'Data-Driven Decision Making',
    description: 'Continue leveraging your business data for insights. Regular analysis helps identify opportunities early.',
    action: 'Schedule weekly business reviews and set up automated alerts for key metrics',
    impact: 'Stay ahead of trends and make proactive business decisions'
  });

  return suggestions.slice(0, 6); // Limit to 6 suggestions
}

// Helper function to get suggestion priority color (for frontend)
export function getSuggestionColor(priority: string): string {
  switch (priority) {
    case 'high': return 'danger';
    case 'medium': return 'warning';
    case 'low': return 'success';
    default: return 'secondary';
  }
}

export default router;