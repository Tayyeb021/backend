import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EvaluationBlueprintsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create evaluation blueprint
   */
  async createBlueprint(data: {
    name: string;
    description?: string;
    questionMappings: any;
    skillMappings: any;
    scoringRules: any;
    clientId: string;
    roleSpecId?: string;
    isDefault?: boolean;
  }) {
    // If setting as default, unset other defaults
    if (data.isDefault) {
      await this.prisma.evaluationBlueprint.updateMany({
        where: { clientId: data.clientId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.evaluationBlueprint.create({
      data: {
        name: data.name,
        description: data.description,
        questionMappings: data.questionMappings as any,
        skillMappings: data.skillMappings as any,
        scoringRules: data.scoringRules as any,
        clientId: data.clientId,
        roleSpecId: data.roleSpecId,
        isDefault: data.isDefault || false,
      },
    });
  }

  /**
   * Get blueprints for client
   */
  async getBlueprints(clientId: string, roleSpecId?: string) {
    const where: any = { clientId, isActive: true };
    if (roleSpecId) {
      where.roleSpecId = roleSpecId;
    }

    return this.prisma.evaluationBlueprint.findMany({
      where,
      include: {
        roleSpec: {
          select: { id: true, title: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get blueprint by ID
   */
  async getBlueprintById(id: string) {
    return this.prisma.evaluationBlueprint.findUnique({
      where: { id },
      include: {
        roleSpec: true,
        client: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Update blueprint
   */
  async updateBlueprint(id: string, updates: any, clientId: string) {
    const blueprint = await this.prisma.evaluationBlueprint.findUnique({
      where: { id },
    });

    if (!blueprint) {
      throw new BadRequestException('Evaluation blueprint not found');
    }

    if (blueprint.clientId !== clientId) {
      throw new BadRequestException('You can only update your own blueprints');
    }

    // If setting as default, unset other defaults
    if (updates.isDefault) {
      await this.prisma.evaluationBlueprint.updateMany({
        where: { clientId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.evaluationBlueprint.update({
      where: { id },
      data: {
        ...updates,
        version: blueprint.version + 1,
      },
    });
  }
}
