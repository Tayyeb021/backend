import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedbackTemplatesService } from './feedback-templates.service';
import { CreateFeedbackTemplateDto } from './dto/create-feedback-template.dto';
import { UpdateFeedbackTemplateDto } from './dto/update-feedback-template.dto';
import { FeedbackOutcomeType } from '@prisma/client';

@Controller('feedback-templates')
@UseGuards(JwtAuthGuard)
export class FeedbackTemplatesController {
  constructor(private feedbackTemplatesService: FeedbackTemplatesService) {}

  @Post()
  async createTemplate(
    @Request() req: any,
    @Body() dto: CreateFeedbackTemplateDto,
  ) {
    return this.feedbackTemplatesService.createTemplate(
      dto,
      req.user.id,
      req.user.companyId,
    );
  }

  @Get()
  async getTemplates(
    @Request() req: any,
    @Query('outcomeType') outcomeType?: FeedbackOutcomeType,
    @Query('includeInactive') includeInactive?: boolean,
  ) {
    return this.feedbackTemplatesService.getTemplates(
      req.user.id,
      req.user.companyId,
      outcomeType,
      includeInactive === true,
    );
  }

  @Get('default')
  async getDefaultTemplate(
    @Request() req: any,
    @Query('outcomeType') outcomeType: FeedbackOutcomeType,
  ) {
    return this.feedbackTemplatesService.getDefaultTemplate(
      outcomeType,
      req.user.id,
      req.user.companyId,
    );
  }

  @Get(':id')
  async getTemplateById(@Param('id') id: string) {
    return this.feedbackTemplatesService.getTemplateById(id);
  }

  @Put(':id')
  async updateTemplate(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackTemplateDto,
  ) {
    return this.feedbackTemplatesService.updateTemplate(id, dto, req.user.id);
  }

  @Delete(':id')
  async deleteTemplate(@Request() req: any, @Param('id') id: string) {
    await this.feedbackTemplatesService.deleteTemplate(id, req.user.id);
    return { message: 'Template deleted successfully' };
  }

  @Post(':id/preview')
  async previewTemplate(
    @Param('id') id: string,
    @Body() variables: Record<string, any>,
  ) {
    const preview = await this.feedbackTemplatesService.previewTemplate(
      id,
      variables,
    );
    return { preview };
  }
}
