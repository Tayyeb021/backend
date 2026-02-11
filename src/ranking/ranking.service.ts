import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';

@Injectable()
export class RankingService {
  constructor(
    private prisma: PrismaService,
    private evidenceService: EvidenceService,
  ) {}

  /**
   * Generate ranking snapshot for a job
   */
  async generateRankingSnapshot(jobId: string, createdBy?: string) {
    // Get all candidates for the job with completed interviews
    const candidates = await this.prisma.candidate.findMany({
      where: { jobId },
      include: {
        interviews: {
          where: { status: 'completed' },
          include: { scoreEvidence: true },
        },
        assessments: {
          where: { status: 'submitted' },
          include: { scoreEvidence: true },
        },
      },
    });

    if (candidates.length === 0) {
      throw new BadRequestException('No candidates found for this job');
    }

    // Calculate rankings with evidence confidence
    const rankings = await Promise.all(
      candidates.map(async (candidate) => {
        const overallScore = this.calculateOverallScore(
          candidate.interviews,
          candidate.assessments,
        );
        const evidenceConfidence = await this.calculateEvidenceConfidence(
          candidate.interviews,
          candidate.assessments,
        );

        return {
          candidateId: candidate.id,
          score: overallScore,
          evidenceConfidence,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
        };
      }),
    );

    // Sort by score (descending), then by evidence confidence (descending)
    rankings.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.evidenceConfidence - a.evidenceConfidence;
    });

    // Assign ranks
    const rankedCandidates = rankings.map((r, index) => ({
      ...r,
      rank: index + 1,
    }));

    // Deactivate previous snapshots
    await this.prisma.rankingSnapshot.updateMany({
      where: { jobId, isActive: true },
      data: { isActive: false },
    });

    // Create new snapshot
    return this.prisma.rankingSnapshot.create({
      data: {
        jobId,
        rankings: rankedCandidates as any,
        totalCandidates: rankedCandidates.length,
        createdBy,
        isActive: true,
      },
    });
  }

  /**
   * Get active ranking snapshot for a job
   */
  async getActiveRanking(jobId: string) {
    return this.prisma.rankingSnapshot.findFirst({
      where: {
        jobId,
        isActive: true,
      },
      orderBy: { snapshotDate: 'desc' },
    });
  }

  /**
   * Get ranking history for a job
   */
  async getRankingHistory(jobId: string) {
    return this.prisma.rankingSnapshot.findMany({
      where: { jobId },
      orderBy: { snapshotDate: 'desc' },
    });
  }

  private calculateOverallScore(interviews: any[], assessments: any[]): number {
    const interviewScores = interviews
      .map((i) => (i.scores as any)?.overall || 0)
      .filter((s) => s > 0);

    const assessmentScores = assessments
      .map((a) => a.score || 0)
      .filter((s) => s > 0);

    const allScores = [...interviewScores, ...assessmentScores];

    if (allScores.length === 0) return 0;

    const sum = allScores.reduce((a, b) => a + b, 0);
    return Math.round(sum / allScores.length);
  }

  private async calculateEvidenceConfidence(
    interviews: any[],
    assessments: any[],
  ): Promise<number> {
    let totalConfidence = 0;
    let count = 0;

    for (const interview of interviews) {
      if (interview.scores) {
        const scoreId = `${interview.id}_overall`;
        const evidence = await this.evidenceService.getEvidenceForScore(scoreId);
        if (evidence.length > 0) {
          const avgConfidence =
            evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length;
          totalConfidence += avgConfidence;
          count++;
        }
      }
    }

    for (const assessment of assessments) {
      if (assessment.score) {
        const scoreId = `${assessment.id}_score`;
        const evidence = await this.evidenceService.getEvidenceForScore(scoreId);
        if (evidence.length > 0) {
          const avgConfidence =
            evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length;
          totalConfidence += avgConfidence;
          count++;
        }
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }
}
