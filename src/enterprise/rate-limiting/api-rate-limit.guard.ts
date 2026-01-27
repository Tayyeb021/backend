import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private requestCounts = new Map<string, { count: number; resetTime: number }>();

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    
    // Get rate limit options from metadata
    const options = this.reflector.get<RateLimitOptions>('rateLimit', handler);
    
    if (!options) {
      return true; // No rate limit configured
    }

    const windowMs = options.windowMs || 15 * 60 * 1000;
    const max = options.max || 100;
    const key = `${request.ip || 'unknown'}_${handler.name}`;
    const now = Date.now();

    // Clean up old entries
    this.requestCounts.forEach((value, k) => {
      if (value.resetTime < now) {
        this.requestCounts.delete(k);
      }
    });

    const current = this.requestCounts.get(key);

    if (!current || current.resetTime < now) {
      // New window
      this.requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= max) {
      throw new HttpException(
        options.message || 'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count++;
    return true;
  }
}
