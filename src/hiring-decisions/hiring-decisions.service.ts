import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HiringDecisionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create hiring decision
   */
  async createDecision(data: {
    candidateId: string;
    jobId: string;
    decisionType: 'hire' | 'reject' | 'hold' | 'offer_pending';
    rationale: string;
    madeBy: string;
    overridesAI?: boolean;
  }) {
    // Validate rationale is not empty
    if (!data.rationale || data.rationale.trim().length === 0) {
      throw new BadRequestException('Rationale is mandatory for hiring decisions');
    }

    // Check if decision already exists
    const existing = await this.prisma.hiringDecision.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: data.candidateId,
          jobId: data.jobId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Hiring decision already exists for this candidate and job');
    }

    // Determine status based on decision type
    let status: 'pending' | 'approved' | 'rejected' | 'on_hold' = 'pending';
    if (data.decisionType === 'hire' || data.decisionType === 'offer_pending') {
      status = 'approved';
    } else if (data.decisionType === 'reject') {
      status = 'rejected';
    } else if (data.decisionType === 'hold') {
      status = 'on_hold';
    }

    // Create decision
    const decision = await this.prisma.hiringDecision.create({
      data: {
        candidateId: data.candidateId,
        jobId: data.jobId,
        decisionType: data.decisionType,
        status,
        rationale: data.rationale,
        madeBy: data.madeBy,
        overridesAI: data.overridesAI || false,
      },
      include: {
        candidate: true,
        job: true,
        madeByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    // Update candidate status if decision is final
    if (status === 'approved' || status === 'rejected') {
      await this.prisma.candidate.update({
        where: { id: data.candidateId },
        data: {
          status: status === 'approved' ? 'advanced' : 'rejected',
        },
      });
    }

    return decision;
  }

  /**
   * Get decision for candidate and job
   */
  async getDecision(candidateId: string, jobId: string) {
    return this.prisma.hiringDecision.findUnique({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId,
        },
      },
      include: {
        candidate: true,
        job: true,
        madeByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Get all decisions for a job
   */
  async getDecisionsForJob(jobId: string) {
    return this.prisma.hiringDecision.findMany({
      where: { jobId },
      include: {
        candidate: true,
        madeByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { madeAt: 'desc' },
    });
  }

  /**
   * Update decision (only if status is pending or on_hold)
   */
  async updateDecision(
    id: string,
    updates: {
      decisionType?: 'hire' | 'reject' | 'hold' | 'offer_pending';
      rationale?: string;
      status?: 'pending' | 'approved' | 'rejected' | 'on_hold';
    },
    userId: string,
  ) {
    const decision = await this.prisma.hiringDecision.findUnique({
      where: { id },
    });

    if (!decision) {
      throw new BadRequestException('Hiring decision not found');
    }

    if (decision.status !== 'pending' && decision.status !== 'on_hold') {
      throw new BadRequestException('Cannot update finalized decisions');
    }

    if (decision.madeBy !== userId) {
      throw new BadRequestException('You can only update your own decisions');
    }

    // Validate rationale if updating
    if (updates.rationale && updates.rationale.trim().length === 0) {
      throw new BadRequestException('Rationale cannot be empty');
    }

    return this.prisma.hiringDecision.update({
      where: { id },
      data: updates,
    });
  }
}
