"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const hpp_1 = __importDefault(require("hpp"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const dbConnect_1 = __importDefault(require("./utils/dbConnect"));
// Import route modules
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
//import dashboardRoutes from './routes/dashboard';
const buyers_1 = __importDefault(require("./routes/buyers"));
const personalSettings_1 = __importDefault(require("./routes/personalSettings"));
const stripe_1 = __importDefault(require("./routes/stripe"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const systemsetting_1 = __importDefault(require("./routes/systemsetting"));
const activity_1 = __importDefault(require("./routes/activity"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const expense_1 = __importDefault(require("./routes/expense"));
const langgraph_1 = __importDefault(require("./routes/langgraph"));
const sample_1 = __importDefault(require("./routes/sample"));
const sampleviewingclient_1 = __importDefault(require("./routes/sampleviewingclient"));
const categories_1 = __importDefault(require("./routes/categories"));
const balance_1 = __importDefault(require("./routes/balance"));
const inventory_1 = __importDefault(require("./routes/inventory"));
const transaction_1 = __importDefault(require("./routes/transaction"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const webhookProxy_1 = __importDefault(require("./routes/webhookProxy")); // Add this import
const app = (0, express_1.default)();
app.use('/api/stripe/webhook', webhook_1.default);
// Middleware
app.use((0, cors_1.default)()); // Enable CORS
app.use((0, helmet_1.default)()); // Security headers
app.use((0, hpp_1.default)()); // Prevent HTTP parameter pollution
app.use((0, morgan_1.default)('dev')); // Logging
app.use((0, compression_1.default)()); // Gzip compression
app.use(body_parser_1.default.json()); // JSON parsing
app.use(body_parser_1.default.urlencoded({ extended: true })); // URL-encoded data
// Connect to MongoDB
(0, dbConnect_1.default)();
// Health check endpoint
app.get("/api/status", (req, res) => {
    res.status(200).json({ "status": "ok v3" });
});
// Mount routes
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
// app.use('/api/dashboard', dashboardRoutes);
app.use('/api/buyers', buyers_1.default);
app.use('/api/personal-settings', personalSettings_1.default);
app.use('/api/activity', activity_1.default);
app.use('/api/notification', notifications_1.default);
app.use('/api/expense', expense_1.default);
app.use('/api/bot', langgraph_1.default);
app.use('/api/sample', sample_1.default);
app.use('/api/sampleviewingclient', sampleviewingclient_1.default);
app.use('/api/systemsettings', systemsetting_1.default);
app.use('/api/categories', categories_1.default);
app.use('/api/balance', balance_1.default);
app.use('/api/stripe', stripe_1.default);
app.use('/api/inventory', inventory_1.default);
app.use('/api/transaction', transaction_1.default);
app.use("/api/dashboard", dashboard_1.default);
app.use('/api/webhook-proxy', webhookProxy_1.default); // Add the new proxy route
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
