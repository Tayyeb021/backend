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
import { InterviewTemplateService } from './interview-template.service';
import { CreateInterviewTemplateDto } from './dto/create-interview-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('interview-templates')
@UseGuards(JwtAuthGuard)
export class InterviewTemplateController {
  constructor(private templateService: InterviewTemplateService) {}

  @Post()
  async createTemplate(
    @Body() createDto: CreateInterviewTemplateDto,
    @Request() req,
  ) {
    return this.templateService.createTemplate(createDto, req.user.id);
  }

  @Get()
  async getTemplates(@Request() req) {
    return this.templateService.getTemplates(req.user.id);
  }

  @Get(':id')
  async getTemplate(@Param('id') id: string, @Request() req) {
    return this.templateService.getTemplate(id, req.user.id);
  }

  @Put(':id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateInterviewTemplateDto>,
    @Request() req,
  ) {
    return this.templateService.updateTemplate(id, updateDto, req.user.id);
  }

  @Delete(':id')
  async deleteTemplate(@Param('id') id: string, @Request() req) {
    await this.templateService.deleteTemplate(id, req.user.id);
    return { message: 'Template deleted successfully' };
  }
}
