import { error } from 'console';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: any; // Attach decoded token info here
}

export const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    // Expected format: "Bearer <token>"
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
      if (err) {
        console.log("err",err)
        return res.status(403).json({error : "Your token has expired, please try signin"})
      }
      req.user = user;
      next();
    });
  } else {
    console.log("JWT token missing in header")
    res.status(401).json({error : "JWT token missing in header"});
  }
};
