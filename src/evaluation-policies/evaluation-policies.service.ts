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
   * If policy is locked, creates a new version instead of updating
   */
  async updatePolicy(id: string, updates: any, clientId: string, createNewVersionIfLocked = true) {
    const policy = await this.prisma.evaluationPolicy.findUnique({ where: { id } });

    if (!policy) {
      throw new BadRequestException('Evaluation policy not found');
    }

    if (policy.clientId !== clientId) {
      throw new BadRequestException('You can only update your own policies');
    }

    // Check if policy is locked
    if (policy.lockedAt && createNewVersionIfLocked) {
      // Create new version instead of updating locked policy
      return this.createPolicyVersion(id, updates, clientId);
    } else if (policy.lockedAt && !createNewVersionIfLocked) {
      throw new BadRequestException('Cannot update locked policy. Unlock it first or create a new version.');
    }

    // If updating weights, validate sum with configurable tolerance
    if (updates.technicalWeight || updates.communicationWeight || 
        updates.problemSolvingWeight || updates.culturalFitWeight) {
      const weightTolerance = updates.weightTolerance ?? 0.5; // Default 0.5% tolerance
      const technicalWeight = updates.technicalWeight ?? policy.technicalWeight;
      const communicationWeight = updates.communicationWeight ?? policy.communicationWeight;
      const problemSolvingWeight = updates.problemSolvingWeight ?? policy.problemSolvingWeight;
      const culturalFitWeight = updates.culturalFitWeight ?? policy.culturalFitWeight;

      const totalWeight = technicalWeight + communicationWeight + problemSolvingWeight + culturalFitWeight;

      if (Math.abs(totalWeight - 100) > weightTolerance) {
        throw new BadRequestException(
          `Score weights must sum to 100 (tolerance: ±${weightTolerance}). Current sum: ${totalWeight}`,
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

    // Remove weightTolerance from updates before saving
    const { weightTolerance: _, ...updateData } = updates;

    return this.prisma.evaluationPolicy.update({
      where: { id },
      data: {
        ...updateData,
        version: policy.version + 1,
      },
    });
  }

  /**
   * Create a new version of a locked policy
   */
  async createPolicyVersion(originalPolicyId: string, updates: any, clientId: string) {
    const originalPolicy = await this.prisma.evaluationPolicy.findUnique({
      where: { id: originalPolicyId },
    });

    if (!originalPolicy) {
      throw new BadRequestException('Original policy not found');
    }

    if (originalPolicy.clientId !== clientId) {
      throw new BadRequestException('You can only create versions of your own policies');
    }

    // Validate weights if provided
    const weightTolerance = updates.weightTolerance ?? 0.5;
    if (updates.technicalWeight || updates.communicationWeight || 
        updates.problemSolvingWeight || updates.culturalFitWeight) {
      const technicalWeight = updates.technicalWeight ?? originalPolicy.technicalWeight;
      const communicationWeight = updates.communicationWeight ?? originalPolicy.communicationWeight;
      const problemSolvingWeight = updates.problemSolvingWeight ?? originalPolicy.problemSolvingWeight;
      const culturalFitWeight = updates.culturalFitWeight ?? originalPolicy.culturalFitWeight;

      const totalWeight = technicalWeight + communicationWeight + problemSolvingWeight + culturalFitWeight;

      if (Math.abs(totalWeight - 100) > weightTolerance) {
        throw new BadRequestException(
          `Score weights must sum to 100 (tolerance: ±${weightTolerance}). Current sum: ${totalWeight}`,
        );
      }
    }

    const { weightTolerance: _, ...updateData } = updates;

    // Create new version (new policy with incremented version)
    return this.prisma.evaluationPolicy.create({
      data: {
        name: updates.name || originalPolicy.name,
        description: updates.description ?? originalPolicy.description,
        version: originalPolicy.version + 1,
        technicalWeight: updates.technicalWeight ?? originalPolicy.technicalWeight,
        communicationWeight: updates.communicationWeight ?? originalPolicy.communicationWeight,
        problemSolvingWeight: updates.problemSolvingWeight ?? originalPolicy.problemSolvingWeight,
        culturalFitWeight: updates.culturalFitWeight ?? originalPolicy.culturalFitWeight,
        minPassingScore: updates.minPassingScore ?? originalPolicy.minPassingScore,
        scoreNormalization: updates.scoreNormalization ?? originalPolicy.scoreNormalization,
        requireEvidence: updates.requireEvidence ?? originalPolicy.requireEvidence,
        evidenceConfidenceThreshold: updates.evidenceConfidenceThreshold ?? originalPolicy.evidenceConfidenceThreshold,
        clientId: originalPolicy.clientId,
        isDefault: updates.isDefault ?? false,
        isActive: true,
        // New version is not locked by default
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * Lock evaluation policy (make it read-only)
   */
  async lockPolicy(id: string, userId: string) {
    const policy = await this.prisma.evaluationPolicy.findUnique({ where: { id } });

    if (!policy) {
      throw new BadRequestException('Evaluation policy not found');
    }

    if (policy.clientId !== userId) {
      throw new BadRequestException('You can only lock your own policies');
    }

    if (policy.lockedAt) {
      throw new BadRequestException('Policy is already locked');
    }

    return this.prisma.evaluationPolicy.update({
      where: { id },
      data: {
        lockedAt: new Date(),
        lockedBy: userId,
      },
    });
  }

  /**
   * Unlock evaluation policy
   */
  async unlockPolicy(id: string, userId: string) {
    const policy = await this.prisma.evaluationPolicy.findUnique({ where: { id } });

    if (!policy) {
      throw new BadRequestException('Evaluation policy not found');
    }

    if (policy.clientId !== userId) {
      throw new BadRequestException('You can only unlock your own policies');
    }

    if (!policy.lockedAt) {
      throw new BadRequestException('Policy is not locked');
    }

    return this.prisma.evaluationPolicy.update({
      where: { id },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * Get policy version history
   */
  async getPolicyHistory(policyId: string, clientId: string) {
    const policy = await this.prisma.evaluationPolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new BadRequestException('Policy not found');
    }

    if (policy.clientId !== clientId) {
      throw new BadRequestException('You can only view history of your own policies');
    }

    // Get all versions of this policy (by name and client)
    return this.prisma.evaluationPolicy.findMany({
      where: {
        name: policy.name,
        clientId: policy.clientId,
      },
      orderBy: { version: 'desc' },
      include: {
        lockedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
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
