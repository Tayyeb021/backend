import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackOutcomeType, FeedbackTemplate } from '@prisma/client';
import { CreateFeedbackTemplateDto } from './dto/create-feedback-template.dto';
import { UpdateFeedbackTemplateDto } from './dto/update-feedback-template.dto';

@Injectable()
export class FeedbackTemplatesService {
  constructor(private prisma: PrismaService) {}

  async createTemplate(
    data: CreateFeedbackTemplateDto,
    clientId: string,
    companyId?: string,
  ): Promise<FeedbackTemplate> {
    // If setting as default, unset other defaults for same outcome type
    if (data.isDefault) {
      await this.prisma.feedbackTemplate.updateMany({
        where: {
          outcomeType: data.outcomeType,
          clientId: companyId ? undefined : clientId,
          companyId: companyId || undefined,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.feedbackTemplate.create({
      data: {
        ...data,
        clientId,
        companyId: companyId || undefined,
        isDefault: data.isDefault || false,
        isActive: data.isActive !== undefined ? data.isActive : true,
        includeScores: data.includeScores || false,
      },
    });
  }

  async getTemplates(
    clientId: string,
    companyId?: string,
    outcomeType?: FeedbackOutcomeType,
    includeInactive?: boolean,
  ): Promise<FeedbackTemplate[]> {
    const where: any = {
      OR: [
        { clientId },
        { companyId: companyId || undefined },
      ],
    };

    if (outcomeType) {
      where.outcomeType = outcomeType;
    }

    if (!includeInactive) {
      where.isActive = true;
    }

    return this.prisma.feedbackTemplate.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async getTemplateById(id: string): Promise<FeedbackTemplate> {
    const template = await this.prisma.feedbackTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('Feedback template not found');
    }

    return template;
  }

  async getDefaultTemplate(
    outcomeType: FeedbackOutcomeType,
    clientId: string,
    companyId?: string,
  ): Promise<FeedbackTemplate | null> {
    const where: any = {
      outcomeType,
      isDefault: true,
      isActive: true,
      OR: [
        { clientId },
        { companyId: companyId || undefined },
      ],
    };

    return this.prisma.feedbackTemplate.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTemplate(
    id: string,
    data: UpdateFeedbackTemplateDto,
    clientId: string,
  ): Promise<FeedbackTemplate> {
    const template = await this.getTemplateById(id);

    // Verify ownership
    if (template.clientId !== clientId) {
      throw new BadRequestException('You can only update your own templates');
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await this.prisma.feedbackTemplate.updateMany({
        where: {
          outcomeType: template.outcomeType,
          clientId,
          id: { not: id },
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.feedbackTemplate.update({
      where: { id },
      data,
    });
  }

  async deleteTemplate(id: string, clientId: string): Promise<void> {
    const template = await this.getTemplateById(id);

    if (template.clientId !== clientId) {
      throw new BadRequestException('You can only delete your own templates');
    }

    await this.prisma.feedbackTemplate.delete({
      where: { id },
    });
  }

  async previewTemplate(
    id: string,
    variables: Record<string, any>,
  ): Promise<string> {
    const template = await this.getTemplateById(id);
    return this.processTemplate(template.template, variables);
  }

  processTemplate(template: string, variables: Record<string, any>): string {
    let processed = template;

    // Replace variables like {{variableName}}
    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const value = variables[key] !== null && variables[key] !== undefined
        ? String(variables[key])
        : '';
      processed = processed.replace(regex, value);
    });

    return processed;
  }
}
