import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('enterprise/webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.recruiter)
export class WebhookController {
  constructor(private webhookService: WebhookService) {}

  @Post()
  async createWebhook(@Body() data: any, @Request() req: any) {
    return this.webhookService.createWebhook({
      ...data,
      organizationId: req.user?.companyId,
    });
  }

  @Get()
  async getWebhooks(@Request() req: any) {
    return this.webhookService.getWebhooks(req.user?.companyId);
  }

  @Get(':id/deliveries')
  async getDeliveries(@Param('id') id: string) {
    return this.webhookService.getWebhookDeliveries(id);
  }
}
