import { Request, Response, NextFunction } from 'express';
import User from '../models/User';

declare module 'express' {
  interface Request {
    user?: Access;
  }
}

interface Access {
  //access: Record<string, Record<string, boolean>>;
  id : string;
}


const checkAccess = (moduleKey: string, permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req?.user?.id)
      
      if (!user || !user.access) {
        console.log('error', 'User not authenticated or access data missing.')
        return res.status(401).json({ error: 'User not authenticated or access data missing.' })
      }
      
      // Skip subscription check for superadmin or user roles
      if (user.role === 'superadmin' || user.role === 'user') {
        console.log('info', `Bypassed subscription check for role: ${user.role}`)
      } else {
        // Check subscription status
        const validSubscriptionStatuses = ['active', 'trialing']
        const isSubscriptionValid = validSubscriptionStatuses.includes(user.subscriptionStatus || '')
        
        // Check current period end
        const now = new Date()
        const currentPeriodEnd = user.currentPeriodEnd ? new Date(user.currentPeriodEnd) : null
        const isCurrentPeriodActive = currentPeriodEnd ? currentPeriodEnd > now : false
        
        if (!isSubscriptionValid || !isCurrentPeriodActive) {
          console.log('error', 'Subscription inactive or expired.')
          return res.status(403).json({ error: 'Subscription expired or inactive. Please update your plan.' })
        }
      }
      
      // Check access permissions with support for nested modules
      let moduleAccess
      
      if (moduleKey.includes('.')) {
        // Handle nested access like "config.users"
        const [parentModule, childModule] = moduleKey.split('.')
        console.log("parentModule,childModule",parentModule,childModule,user.access)
        moduleAccess = user.access[parentModule]?.[childModule]
        console.log("moduleAccess",moduleAccess)
      } else {
        // Handle direct access like "inventory"
        moduleAccess = user.access[moduleKey]
      }
      
      if (moduleAccess && moduleAccess[permission]) {
        return next()
      }
      
      console.log('error', `Access Denied. Missing required permission: ${moduleKey}.${permission}`)
      return res.status(403).json({ error: 'Access Denied. Missing required permission.' })
    } catch (err) {
      console.error('checkAccess error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

export const isSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req?.user?.id);
    //console.log("user",user)
    if (!user || user.role !== 'superadmin') {
      console.log("error", "Access denied. SuperAdmin only.");
      return res.status(403).json({ error: 'Access denied. SuperAdmin only.' });
    }

    next();
  } catch (err) {
    console.log("error", "Server error during SuperAdmin check.");
    return res.status(500).json({ error: 'Server error.' });
  }
};

export default checkAccess;
