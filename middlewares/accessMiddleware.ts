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

// Middleware factory: returns a middleware function
const checkAccess = (moduleKey: string, permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Assume req.user is already set by your auth middleware
    const user = await User.findById(req?.user?.id)
    //req.user as Access | undefined;
    //console.log("user.access",user.access)
    if (!user || !user.access) {
      console.log("error","User not authenticated or access data missing.")
      return res.status(401).json({ error: 'User not authenticated or access data missing.' });
    }
    // Check if user has permission for the given module/key
    if (user.access[moduleKey] && user.access[moduleKey][permission]) {
      return next();
    }
    console.log("error","Access Denied.")
    return res.status(500).json({ error: 'Access Denied.' });
  };
};

export default checkAccess;
