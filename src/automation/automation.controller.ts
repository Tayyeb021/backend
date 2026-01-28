import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('automation')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Post('rules')
  async createRule(@Request() req: any, @Body() body: any) {
    return this.automationService.createRule({
      ...body,
      organizationId: req.user.companyId,
    });
  }

  @Get('rules')
  async getRules(@Request() req: any) {
    return this.automationService.getRules(req.user.companyId);
  }

  @Put('rules/:id')
  async updateRule(@Param('id') id: string, @Body() body: any) {
    return this.automationService.updateRule(id, body);
  }

  @Delete('rules/:id')
  async deleteRule(@Param('id') id: string) {
    return this.automationService.deleteRule(id);
  }
}
