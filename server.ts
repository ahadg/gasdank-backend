import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';

import dbConnect from './utils/dbConnect';
import redisClient from './utils/redisClient';

// Load environment variables
dotenv.config();

// Import route modules
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
//import dashboardRoutes from './routes/dashboard';
import buyersRoutes from './routes/buyers';
import stripesRoutes from './routes/stripe';
import webhookRoutes from './routes/webhook';
import systemsettingsRoutes from './routes/systemsetting';
import activityRoutes from './routes/activity';
import notificationRoutes from './routes/notifications';
import expensesRoutes from './routes/expense';
import sampleRoutes from './routes/sample';
import sampleviewingclientRoutes from './routes/sampleviewingclient';
import categoriesRoutes from './routes/categories';
import balanceRoutes from './routes/balance';
import inventoryRoutes from './routes/inventory';
import transactionRoutes from './routes/transaction';
import dashboardRoutes from './routes/dashboard';


const app = express();



app.use('/api/stripe/webhook', webhookRoutes);

// Middleware
app.use(cors()); // Enable CORS
app.use(helmet()); // Security headers
app.use(hpp()); // Prevent HTTP parameter pollution
app.use(morgan('dev')); // Logging
app.use(compression()); // Gzip compression
app.use(bodyParser.json()); // JSON parsing
app.use(bodyParser.urlencoded({ extended: true })); // URL-encoded data

// Connect to MongoDB
dbConnect();

// Health check endpoint
app.get("/api/status", (req, res) => {
    res.status(200).json({ "status": "ok v3" });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
// app.use('/api/dashboard', dashboardRoutes);
app.use('/api/buyers', buyersRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/expense', expensesRoutes);
app.use('/api/sample', sampleRoutes);
app.use('/api/sampleviewingclient', sampleviewingclientRoutes);
app.use('/api/systemsettings', systemsettingsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/stripe', stripesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transaction', transactionRoutes);
app.use("/api/dashboard", dashboardRoutes)

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
