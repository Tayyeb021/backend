import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';

@Injectable()
export class CertifiedProfilesService {
  constructor(
    private prisma: PrismaService,
    private evidenceService: EvidenceService,
  ) {}

  /**
   * Certify a candidate profile
   */
  async certifyProfile(
    candidateId: string,
    jobId: string,
    certifiedBy: string,
  ) {
    // Get candidate with all interviews and assessments
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        interviews: {
          where: { status: 'completed' },
          include: { scoreEvidence: true },
        },
        assessments: {
          where: { status: 'submitted' },
          include: { scoreEvidence: true },
        },
        job: true,
      },
    });

    if (!candidate) {
      throw new BadRequestException('Candidate not found');
    }

    if (candidate.jobId !== jobId) {
      throw new BadRequestException('Candidate is not associated with this job');
    }

    // Validate all scores have evidence
    for (const interview of candidate.interviews) {
      if (interview.scores) {
        const scoreId = `${interview.id}_overall`;
        const hasEvidence = await this.evidenceService.validateScoreHasEvidence(
          scoreId,
        );
        if (!hasEvidence) {
          throw new BadRequestException(
            `Interview ${interview.id} scores lack evidence`,
          );
        }
      }
    }

    // Aggregate scores and evidence
    const aggregatedScores = this.aggregateScores(candidate.interviews);
    const evidenceSummary = this.createEvidenceSummary(
      candidate.interviews,
      candidate.assessments,
    );

    // Get ranking (from ranking service)
    const ranking = await this.getCandidateRanking(candidateId, jobId);

    // Create certified profile
    return this.prisma.certifiedProfile.create({
      data: {
        candidateId,
        jobId,
        scores: aggregatedScores as any,
        evidenceSummary: evidenceSummary as any,
        ranking,
        status: 'certified',
        certifiedAt: new Date(),
        certifiedBy,
      },
      include: {
        candidate: true,
        job: true,
        certifiedByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Get certified profile (read-only)
   */
  async getCertifiedProfile(candidateId: string, jobId: string) {
    const profile = await this.prisma.certifiedProfile.findUnique({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId,
        },
      },
      include: {
        candidate: true,
        job: true,
        certifiedByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!profile || profile.status !== 'certified') {
      throw new BadRequestException('Certified profile not found');
    }

    return profile;
  }

  /**
   * Get all certified profiles for a job
   */
  async getCertifiedProfilesForJob(jobId: string) {
    return this.prisma.certifiedProfile.findMany({
      where: {
        jobId,
        status: 'certified',
      },
      include: {
        candidate: true,
        certifiedByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { ranking: 'asc' },
    });
  }

  private aggregateScores(interviews: any[]) {
    // Aggregate scores from all interviews
    const scores = interviews
      .map((i) => i.scores)
      .filter((s) => s !== null && s !== undefined);

    if (scores.length === 0) return null;

    const aggregated = {
      technical: 0,
      communication: 0,
      problemSolving: 0,
      culturalFit: 0,
      overall: 0,
    };

    scores.forEach((score: any) => {
      aggregated.technical += score.technical || 0;
      aggregated.communication += score.communication || 0;
      aggregated.problemSolving += score.problemSolving || 0;
      aggregated.culturalFit += score.culturalFit || 0;
      aggregated.overall += score.overall || 0;
    });

    const count = scores.length;
    return {
      technical: Math.round(aggregated.technical / count),
      communication: Math.round(aggregated.communication / count),
      problemSolving: Math.round(aggregated.problemSolving / count),
      culturalFit: Math.round(aggregated.culturalFit / count),
      overall: Math.round(aggregated.overall / count),
    };
  }

  private createEvidenceSummary(interviews: any[], assessments: any[]) {
    return {
      interviewCount: interviews.length,
      assessmentCount: assessments.length,
      totalEvidenceItems: interviews.length + assessments.length,
      evidenceTypes: ['transcript', 'assessment', 'video'],
    };
  }

  private async getCandidateRanking(
    candidateId: string,
    jobId: string,
  ): Promise<number> {
    // This would call the ranking service
    // For now, return placeholder - will be implemented in ranking module
    const snapshot = await this.prisma.rankingSnapshot.findFirst({
      where: {
        jobId,
        isActive: true,
      },
      orderBy: { snapshotDate: 'desc' },
    });

    if (snapshot) {
      const rankings = snapshot.rankings as any[];
      const candidateRank = rankings.findIndex(
        (r: any) => r.candidateId === candidateId,
      );
      return candidateRank >= 0 ? candidateRank + 1 : 999;
    }

    return 999;
  }
}
