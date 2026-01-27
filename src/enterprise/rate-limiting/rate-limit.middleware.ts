import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Rate limiting will be handled by the ApiRateLimitGuard
    // This middleware can be extended for global rate limiting if needed
    // Redis can be used here for distributed rate limiting if needed
    next();
  }
}
