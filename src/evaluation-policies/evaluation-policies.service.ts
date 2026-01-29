import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EvaluationPoliciesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create evaluation policy
   */
  async createPolicy(data: {
    name: string;
    description?: string;
    technicalWeight?: number;
    communicationWeight?: number;
    problemSolvingWeight?: number;
    culturalFitWeight?: number;
    minPassingScore?: number;
    scoreNormalization?: boolean;
    requireEvidence?: boolean;
    evidenceConfidenceThreshold?: number;
    isDefault?: boolean;
    clientId: string;
  }) {
    // Validate weights sum to 100
    const totalWeight =
      (data.technicalWeight || 40) +
      (data.communicationWeight || 25) +
      (data.problemSolvingWeight || 20) +
      (data.culturalFitWeight || 15);

    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new BadRequestException(
        `Score weights must sum to 100. Current sum: ${totalWeight}`,
      );
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await this.prisma.evaluationPolicy.updateMany({
        where: { clientId: data.clientId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.evaluationPolicy.create({
      data: {
        name: data.name,
        description: data.description,
        technicalWeight: data.technicalWeight || 40,
        communicationWeight: data.communicationWeight || 25,
        problemSolvingWeight: data.problemSolvingWeight || 20,
        culturalFitWeight: data.culturalFitWeight || 15,
        minPassingScore: data.minPassingScore || 70,
        scoreNormalization: data.scoreNormalization !== undefined ? data.scoreNormalization : true,
        requireEvidence: data.requireEvidence !== undefined ? data.requireEvidence : true,
        evidenceConfidenceThreshold: data.evidenceConfidenceThreshold || 0.7,
        clientId: data.clientId,
        isDefault: data.isDefault || false,
      },
    });
  }

  /**
   * Update evaluation policy
   */
  async updatePolicy(id: string, updates: any, clientId: string) {
    const policy = await this.prisma.evaluationPolicy.findUnique({ where: { id } });

    if (!policy) {
      throw new BadRequestException('Evaluation policy not found');
    }

    if (policy.clientId !== clientId) {
      throw new BadRequestException('You can only update your own policies');
    }

    // If updating weights, validate sum
    if (updates.technicalWeight || updates.communicationWeight || 
        updates.problemSolvingWeight || updates.culturalFitWeight) {
      const technicalWeight = updates.technicalWeight ?? policy.technicalWeight;
      const communicationWeight = updates.communicationWeight ?? policy.communicationWeight;
      const problemSolvingWeight = updates.problemSolvingWeight ?? policy.problemSolvingWeight;
      const culturalFitWeight = updates.culturalFitWeight ?? policy.culturalFitWeight;

      const totalWeight = technicalWeight + communicationWeight + problemSolvingWeight + culturalFitWeight;

      if (Math.abs(totalWeight - 100) > 0.01) {
        throw new BadRequestException(
          `Score weights must sum to 100. Current sum: ${totalWeight}`,
        );
      }
    }

    // If setting as default, unset other defaults
    if (updates.isDefault) {
      await this.prisma.evaluationPolicy.updateMany({
        where: { clientId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.evaluationPolicy.update({
      where: { id },
      data: {
        ...updates,
        version: policy.version + 1,
      },
    });
  }

  /**
   * Calculate scores using policy weights
   */
  async calculateScores(
    policyId: string,
    scores: {
      technical: number;
      communication: number;
      problemSolving: number;
      culturalFit: number;
    },
  ): Promise<{
    overall: number;
    passed: boolean;
    breakdown: {
      technical: number;
      communication: number;
      problemSolving: number;
      culturalFit: number;
      overall: number;
    };
  }> {
    const policy = await this.prisma.evaluationPolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new BadRequestException('Evaluation policy not found');
    }

    // Normalize scores if required
    let normalizedScores = { ...scores };
    if (policy.scoreNormalization) {
      // Normalize to 0-100 range
      normalizedScores = {
        technical: Math.min(100, Math.max(0, scores.technical)),
        communication: Math.min(100, Math.max(0, scores.communication)),
        problemSolving: Math.min(100, Math.max(0, scores.problemSolving)),
        culturalFit: Math.min(100, Math.max(0, scores.culturalFit)),
      };
    }

    // Calculate weighted scores
    const technicalScore = (normalizedScores.technical * policy.technicalWeight) / 100;
    const communicationScore =
      (normalizedScores.communication * policy.communicationWeight) / 100;
    const problemSolvingScore =
      (normalizedScores.problemSolving * policy.problemSolvingWeight) / 100;
    const culturalFitScore =
      (normalizedScores.culturalFit * policy.culturalFitWeight) / 100;

    const overall = Math.round(
      technicalScore +
        communicationScore +
        problemSolvingScore +
        culturalFitScore,
    );

    const passed = overall >= policy.minPassingScore;

    return {
      overall,
      passed,
      breakdown: {
        technical: normalizedScores.technical,
        communication: normalizedScores.communication,
        problemSolving: normalizedScores.problemSolving,
        culturalFit: normalizedScores.culturalFit,
        overall,
      },
    };
  }

  /**
   * Get policies for client
   */
  async getPolicies(clientId: string, includeInactive = false) {
    const where: any = { clientId };
    if (!includeInactive) {
      where.isActive = true;
    }

    return this.prisma.evaluationPolicy.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get default policy for client
   */
  async getDefaultPolicy(clientId: string) {
    return this.prisma.evaluationPolicy.findFirst({
      where: {
        clientId,
        isDefault: true,
        isActive: true,
      },
    });
  }

  /**
   * Get policy by ID
   */
  async getPolicyById(id: string) {
    return this.prisma.evaluationPolicy.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
