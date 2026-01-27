import { Module } from '@nestjs/common';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { ApiRateLimitGuard } from './api-rate-limit.guard';

@Module({
  providers: [RateLimitMiddleware, ApiRateLimitGuard],
  exports: [RateLimitMiddleware, ApiRateLimitGuard],
})
export class RateLimitModule {}
