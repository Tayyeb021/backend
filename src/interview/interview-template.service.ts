import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InterviewTemplate, QuestionType } from '@prisma/client';
import { CreateInterviewTemplateDto } from './dto/create-interview-template.dto';

@Injectable()
export class InterviewTemplateService {
  constructor(private prisma: PrismaService) {}

  async createTemplate(
    createDto: CreateInterviewTemplateDto,
    clientId: string,
  ): Promise<InterviewTemplate> {
    // If setting as default, unset other defaults for this client
    if (createDto.isDefault) {
      await this.prisma.interviewTemplate.updateMany({
        where: { clientId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return await this.prisma.interviewTemplate.create({
      data: {
        name: createDto.name,
        description: createDto.description,
        clientId,
        isDefault: createDto.isDefault || false,
        isPublic: createDto.isPublic || false,
        questions: {
          create: createDto.questions.map((q) => ({
            question: q.question,
            type: q.type,
            order: q.order,
            timeLimit: q.timeLimit,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async getTemplates(clientId: string, includePublic: boolean = true) {
    return await this.prisma.interviewTemplate.findMany({
      where: {
        OR: [
          { clientId },
          ...(includePublic ? [{ isPublic: true }] : []),
        ],
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async getTemplate(id: string, clientId: string): Promise<InterviewTemplate> {
    const template = await this.prisma.interviewTemplate.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Check access: must be owner or public
    if (template.clientId !== clientId && !template.isPublic) {
      throw new ForbiddenException('Access denied');
    }

    return template;
  }

  async updateTemplate(
    id: string,
    updateDto: Partial<CreateInterviewTemplateDto>,
    clientId: string,
  ): Promise<InterviewTemplate> {
    const template = await this.getTemplate(id, clientId);

    if (template.clientId !== clientId) {
      throw new ForbiddenException('Only template owner can update');
    }

    // Handle default flag
    if (updateDto.isDefault) {
      await this.prisma.interviewTemplate.updateMany({
        where: { clientId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // Update template
    const updatedTemplate = await this.prisma.interviewTemplate.update({
      where: { id },
      data: {
        name: updateDto.name,
        description: updateDto.description,
        isDefault: updateDto.isDefault,
        isPublic: updateDto.isPublic,
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    // Update questions if provided
    if (updateDto.questions) {
      // Delete existing questions
      await this.prisma.interviewQuestion.deleteMany({
        where: { templateId: id },
      });

      // Create new questions
      await this.prisma.interviewQuestion.createMany({
        data: updateDto.questions.map((q) => ({
          templateId: id,
          question: q.question,
          type: q.type,
          order: q.order,
          timeLimit: q.timeLimit,
        })),
      });

      return await this.getTemplate(id, clientId);
    }

    return updatedTemplate;
  }

  async deleteTemplate(id: string, clientId: string): Promise<void> {
    const template = await this.getTemplate(id, clientId);

    if (template.clientId !== clientId) {
      throw new ForbiddenException('Only template owner can delete');
    }

    await this.prisma.interviewTemplate.delete({
      where: { id },
    });
  }
}
