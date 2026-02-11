import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Get()
  async getIntegrations(@Request() req: any) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    return this.integrationsService.getIntegrations(userId, companyId);
  }

  @Get('available')
  async getAvailableIntegrations() {
    return this.integrationsService.getAvailableIntegrations();
  }

  @Post()
  async createIntegration(
    @Request() req: any,
    @Body()
    body: {
      type: string;
      name: string;
      provider: string;
      config: any;
    },
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId || null;
    return this.integrationsService.createIntegration(
      userId,
      companyId,
      body.type,
      body.name,
      body.provider,
      body.config,
    );
  }

  @Put(':id')
  async updateIntegration(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      config?: any;
      isActive?: boolean;
    },
  ) {
    return this.integrationsService.updateIntegration(id, body);
  }

  @Delete(':id')
  async deleteIntegration(@Param('id') id: string) {
    return this.integrationsService.deleteIntegration(id);
  }

  @Post(':id/test')
  async testIntegration(@Param('id') id: string) {
    return this.integrationsService.testIntegration(id);
  }

  @Post(':id/sync')
  async syncIntegration(@Param('id') id: string) {
    return this.integrationsService.syncIntegration(id);
  }
}
