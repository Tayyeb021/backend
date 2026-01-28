import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhiteLabelService } from './white-label.service';

@Controller('white-label')
@UseGuards(JwtAuthGuard)
export class WhiteLabelController {
  constructor(private whiteLabelService: WhiteLabelService) {}

  @Get()
  async getWhiteLabelConfig(@Request() req: any) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new Error('Company ID required');
    }
    return this.whiteLabelService.getWhiteLabelConfig(companyId);
  }

  @Put()
  async updateWhiteLabelConfig(
    @Request() req: any,
    @Body()
    body: {
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      companyName?: string;
      domain?: string;
      customCss?: string;
      isActive?: boolean;
    },
  ) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new Error('Company ID required');
    }

    // Validate domain if provided
    if (body.domain) {
      const isValid = await this.whiteLabelService.validateDomain(body.domain);
      if (!isValid) {
        throw new Error('Domain is invalid or already taken');
      }
    }

    return this.whiteLabelService.updateWhiteLabelConfig(companyId, body);
  }

  @Get('domain/:domain/validate')
  async validateDomain(@Param('domain') domain: string) {
    const isValid = await this.whiteLabelService.validateDomain(domain);
    return { isValid };
  }

  @Get('domain/:domain')
  async getConfigByDomain(@Param('domain') domain: string) {
    return this.whiteLabelService.getConfigByDomain(domain);
  }
}
