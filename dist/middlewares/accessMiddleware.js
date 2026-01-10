"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuperAdmin = void 0;
const User_1 = __importDefault(require("../models/User"));
const checkAccess = (moduleKey, permission) => {
    return async (req, res, next) => {
        try {
            const user = await User_1.default.findById(req?.user?.id);
            if (!user || !user.access) {
                console.log('error', 'User not authenticated or access data missing.');
                return res.status(401).json({ error: 'User not authenticated or access data missing.' });
            }
            // Skip subscription check for superadmin or user roles
            if (user.role === 'superadmin' || user.role === 'user') {
                console.log('info', `Bypassed subscription check for role: ${user.role}`);
            }
            else {
                // Check subscription status
                const validSubscriptionStatuses = ['active', 'trialing'];
                const isSubscriptionValid = validSubscriptionStatuses.includes(user.subscriptionStatus || '');
                // Check current period end
                const now = new Date();
                const currentPeriodEnd = user.currentPeriodEnd ? new Date(user.currentPeriodEnd) : null;
                const isCurrentPeriodActive = currentPeriodEnd ? currentPeriodEnd > now : false;
                if (!isSubscriptionValid || !isCurrentPeriodActive) {
                    console.log('error', 'Subscription inactive or expired.');
                    return res.status(403).json({ error: 'Subscription expired or inactive. Please update your plan.' });
                }
            }
            // Check access permissions with support for nested modules
            let moduleAccess;
            if (moduleKey.includes('.')) {
                // Handle nested access like "config.users"
                const [parentModule, childModule] = moduleKey.split('.');
                console.log("parentModule,childModule", parentModule, childModule, user.access);
                moduleAccess = user.access[parentModule]?.[childModule];
                console.log("moduleAccess", moduleAccess);
            }
            else {
                // Handle direct access like "inventory"
                moduleAccess = user.access[moduleKey];
            }
            if (moduleAccess && moduleAccess[permission]) {
                return next();
            }
            console.log('error', `Access Denied. Missing required permission: ${moduleKey}.${permission}`);
            return res.status(403).json({ error: 'Access Denied. Missing required permission.' });
        }
        catch (err) {
            console.error('checkAccess error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    };
};
const isSuperAdmin = async (req, res, next) => {
    try {
        const user = await User_1.default.findById(req?.user?.id);
        //console.log("user",user)
        if (!user || user.role !== 'superadmin') {
            console.log("error", "Access denied. SuperAdmin only.");
            return res.status(403).json({ error: 'Access denied. SuperAdmin only.' });
        }
        next();
    }
    catch (err) {
        console.log("error", "Server error during SuperAdmin check.");
        return res.status(500).json({ error: 'Server error.' });
    }
};
exports.isSuperAdmin = isSuperAdmin;
exports.default = checkAccess;
