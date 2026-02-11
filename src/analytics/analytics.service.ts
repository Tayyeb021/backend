import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate time-to-hire metric
   */
  async calculateTimeToHire(
    userId?: string,
    companyId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<number> {
    try {
      const where: any = {};
      
      // Build job filter
      if (userId || companyId) {
        const jobWhere: any = {};
        if (userId) {
          jobWhere.clientId = userId;
        }
        if (companyId) {
          jobWhere.client = { companyId };
        }
        const jobs = await this.prisma.job.findMany({
          where: jobWhere,
          select: { id: true },
        });
        if (jobs.length === 0) return 0;
        where.jobId = { in: jobs.map((j) => j.id) };
      }
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const candidates = await this.prisma.candidate.findMany({
        where: {
          ...where,
          status: 'advanced', // Hired/Advanced status
        },
        include: {
          interviews: {
            where: { status: 'completed' },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });

      if (candidates.length === 0) return 0;

      const totalDays = candidates.reduce((sum, candidate) => {
        if (candidate.interviews.length === 0) return sum;
        const firstInterview = candidate.interviews[0];
        if (!firstInterview.createdAt) return sum;
        const daysDiff =
          (candidate.updatedAt.getTime() - firstInterview.createdAt.getTime()) /
          (1000 * 60 * 60 * 24);
        return sum + daysDiff;
      }, 0);

      return Math.round(totalDays / candidates.length);
    } catch (error) {
      console.error('Error calculating time to hire:', error);
      return 0;
    }
  }

  /**
   * Calculate cost-per-hire
   */
  async calculateCostPerHire(
    userId?: string,
    companyId?: string,
    period?: { start: Date; end: Date },
  ): Promise<number> {
    try {
      // Base costs (can be configured per company)
      const baseCosts = {
        sourcing: 500, // AED per candidate
        interview: 200, // AED per interview
        admin: 300, // AED per hire
      };

      const where: any = {};
      
      // Build job filter
      if (userId || companyId) {
        const jobWhere: any = {};
        if (userId) {
          jobWhere.clientId = userId;
        }
        if (companyId) {
          jobWhere.client = { companyId };
        }
        const jobs = await this.prisma.job.findMany({
          where: jobWhere,
          select: { id: true },
        });
        if (jobs.length === 0) return 0;
        where.jobId = { in: jobs.map((j) => j.id) };
      }
      
      if (period) {
        where.updatedAt = {
          gte: period.start,
          lte: period.end,
        };
      }

      const hires = await this.prisma.candidate.findMany({
        where: {
          ...where,
          status: 'advanced',
        },
        include: {
          interviews: true,
        },
      });

      if (hires.length === 0) return 0;

      const totalCost = hires.reduce((sum, hire) => {
        const interviewCost = hire.interviews.length * baseCosts.interview;
        return sum + baseCosts.sourcing + interviewCost + baseCosts.admin;
      }, 0);

      return Math.round(totalCost / hires.length);
    } catch (error) {
      console.error('Error calculating cost per hire:', error);
      return 0;
    }
  }

  /**
   * Calculate quality-of-hire score
   */
  async calculateQualityOfHire(
    userId?: string,
    companyId?: string,
    period?: { start: Date; end: Date },
  ): Promise<number> {
    try {
      const where: any = {};
      
      // Build job filter
      if (userId || companyId) {
        const jobWhere: any = {};
        if (userId) {
          jobWhere.clientId = userId;
        }
        if (companyId) {
          jobWhere.client = { companyId };
        }
        const jobs = await this.prisma.job.findMany({
          where: jobWhere,
          select: { id: true },
        });
        if (jobs.length === 0) return 0;
        where.jobId = { in: jobs.map((j) => j.id) };
      }
      
      if (period) {
        where.createdAt = {
          gte: period.start,
          lte: period.end,
        };
      }

      const hires = await this.prisma.candidate.findMany({
        where: {
          ...where,
          status: 'advanced',
        },
        include: {
          interviews: {
            where: { status: 'completed' },
          },
        },
      });

      if (hires.length === 0) return 0;

      const totalScore = hires.reduce((sum, hire) => {
        if (hire.interviews.length === 0) return sum;
        const avgScore =
          hire.interviews.reduce(
            (s, i) => s + ((i.scores as any)?.overall || 0),
            0,
          ) / hire.interviews.length;
        return sum + avgScore;
      }, 0);

      return Math.round(totalScore / hires.length);
    } catch (error) {
      console.error('Error calculating quality of hire:', error);
      return 0;
    }
  }

  /**
   * Calculate interview-to-offer conversion rate
   */
  async calculateInterviewToOfferRate(
    userId?: string,
    companyId?: string,
    period?: { start: Date; end: Date },
  ): Promise<number> {
    try {
      // Build job filter for interviews and candidates
      let jobIds: string[] | undefined;
      if (userId || companyId) {
        const jobWhere: any = {};
        if (userId) {
          jobWhere.clientId = userId;
        }
        if (companyId) {
          jobWhere.client = { companyId };
        }
        const jobs = await this.prisma.job.findMany({
          where: jobWhere,
          select: { id: true },
        });
        if (jobs.length === 0) return 0;
        jobIds = jobs.map((j) => j.id);
      }

      const interviewWhere: any = {
        status: 'completed',
      };
      if (jobIds) {
        interviewWhere.jobId = { in: jobIds };
      }
      if (period) {
        interviewWhere.createdAt = {
          gte: period.start,
          lte: period.end,
        };
      }

      const candidateWhere: any = {
        status: 'advanced',
      };
      if (jobIds) {
        candidateWhere.jobId = { in: jobIds };
      }
      if (period) {
        candidateWhere.createdAt = {
          gte: period.start,
          lte: period.end,
        };
      }

      const [totalInterviews, offers] = await Promise.all([
        this.prisma.interview.count({ where: interviewWhere }),
        this.prisma.candidate.count({ where: candidateWhere }),
      ]);

      if (totalInterviews === 0) return 0;
      return Math.round((offers / totalInterviews) * 100);
    } catch (error) {
      console.error('Error calculating interview to offer rate:', error);
      return 0;
    }
  }

  /**
   * Calculate source effectiveness
   */
  async calculateSourceEffectiveness(
    userId?: string,
    companyId?: string,
  ): Promise<any[]> {
    try {
      // Build job filter
      let jobIds: string[] | undefined;
      if (userId || companyId) {
        const jobWhere: any = {};
        if (userId) {
          jobWhere.clientId = userId;
        }
        if (companyId) {
          jobWhere.client = { companyId };
        }
        const jobs = await this.prisma.job.findMany({
          where: jobWhere,
          select: { id: true },
        });
        if (jobs.length === 0) return [];
        jobIds = jobs.map((j) => j.id);
      }

      const candidateWhere: any = {};
      if (jobIds) {
        candidateWhere.jobId = { in: jobIds };
      }

      const candidates = await this.prisma.candidate.findMany({
        where: candidateWhere,
        include: {
          interviews: {
            where: { status: 'completed' },
          },
        },
      });

      const sourceStats: Record<string, any> = {};

      candidates.forEach((candidate) => {
        const source = candidate.sourcePlatform || 'unknown';
        if (!sourceStats[source]) {
          sourceStats[source] = {
            source,
            total: 0,
            interviewed: 0,
            advanced: 0,
            avgScore: 0,
            scoreSum: 0,
            scoreCount: 0,
          };
        }

        sourceStats[source].total++;
        if (candidate.interviews.length > 0) {
          sourceStats[source].interviewed++;
          const avgScore =
            candidate.interviews.reduce(
              (s, i) => s + ((i.scores as any)?.overall || 0),
              0,
            ) / candidate.interviews.length;
          sourceStats[source].scoreSum += avgScore;
          sourceStats[source].scoreCount++;
          sourceStats[source].avgScore = sourceStats[source].scoreSum / sourceStats[source].scoreCount;
        }
        if (candidate.status === 'advanced') {
          sourceStats[source].advanced++;
        }
      });

      return Object.values(sourceStats).map((stat: any) => ({
        source: stat.source,
        total: stat.total,
        interviewed: stat.interviewed,
        advanced: stat.advanced,
        avgScore: Math.round(stat.avgScore * 10) / 10, // Round to 1 decimal
        conversionRate:
          stat.total > 0 ? Math.round((stat.advanced / stat.total) * 100) : 0,
        interviewRate:
          stat.total > 0 ? Math.round((stat.interviewed / stat.total) * 100) : 0,
      }));
    } catch (error) {
      console.error('Error calculating source effectiveness:', error);
      return [];
    }
  }

  /**
   * Save analytics metric
   */
  async saveMetric(
    metricType: string,
    metricValue: number,
    userId?: string,
    companyId?: string,
    period?: { start: Date; end: Date },
    metadata?: any,
  ) {
    return this.prisma.analyticsMetric.create({
      data: {
        userId,
        companyId,
        metricType,
        metricValue,
        period: period ? 'monthly' : undefined,
        periodStart: period?.start || new Date(),
        periodEnd: period?.end || new Date(),
        metadata: metadata as any,
      },
    });
  }

  /**
   * Get analytics dashboard data
   */
  async getDashboardAnalytics(
    userId?: string,
    companyId?: string,
    period?: { start: Date; end: Date },
  ) {
    try {
      const [timeToHire, costPerHire, qualityOfHire, interviewToOfferRate, sourceEffectiveness] = await Promise.all([
        this.calculateTimeToHire(
          userId,
          companyId,
          period?.start,
          period?.end,
        ).catch(() => 0),
        this.calculateCostPerHire(
          userId,
          companyId,
          period,
        ).catch(() => 0),
        this.calculateQualityOfHire(
          userId,
          companyId,
          period,
        ).catch(() => 0),
        this.calculateInterviewToOfferRate(
          userId,
          companyId,
          period,
        ).catch(() => 0),
        this.calculateSourceEffectiveness(
          userId,
          companyId,
        ).catch(() => []),
      ]);

      return {
        timeToHire: timeToHire || 0,
        costPerHire: costPerHire || 0,
        qualityOfHire: qualityOfHire || 0,
        interviewToOfferRate: interviewToOfferRate || 0,
        sourceEffectiveness: sourceEffectiveness || [],
        period: period || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          end: new Date(),
        },
      };
    } catch (error) {
      console.error('Error in getDashboardAnalytics:', error);
      // Return default values on error
      return {
        timeToHire: 0,
        costPerHire: 0,
        qualityOfHire: 0,
        interviewToOfferRate: 0,
        sourceEffectiveness: [],
        period: period || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      };
    }
  }

  /**
   * Get score distribution analytics
   * Shows distribution of scores across different categories
   */
  async getScoreDistribution(
    userId?: string,
    companyId?: string,
    jobId?: string,
    scoreType: 'technical' | 'communication' | 'problemSolving' | 'culturalFit' | 'overall' = 'overall',
    period?: { start: Date; end: Date },
  ) {
    try {
      const where: any = {
        status: 'completed',
      };

      // Build job filter
      if (userId || companyId || jobId) {
        const jobWhere: any = {};
        if (userId) jobWhere.clientId = userId;
        if (companyId) jobWhere.client = { companyId };
        if (jobId) jobWhere.id = jobId;

        const jobs = await this.prisma.job.findMany({
          where: jobWhere,
          select: { id: true },
        });
        if (jobs.length === 0) return { distribution: [], total: 0 };
        where.jobId = { in: jobs.map((j) => j.id) };
      }

      if (period) {
        where.completedAt = {};
        if (period.start) where.completedAt.gte = period.start;
        if (period.end) where.completedAt.lte = period.end;
      }

      const interviews = await this.prisma.interview.findMany({
        where,
        select: {
          id: true,
          scores: true,
        },
      });

      // Extract scores and create distribution buckets
      const buckets = {
        '0-20': 0,
        '21-40': 0,
        '41-60': 0,
        '61-80': 0,
        '81-100': 0,
      };

      let total = 0;
      let sum = 0;

      interviews.forEach((interview) => {
        const scores = interview.scores as any;
        if (!scores || !scores[scoreType]) return;

        const score = scores[scoreType];
        total++;
        sum += score;

        if (score <= 20) buckets['0-20']++;
        else if (score <= 40) buckets['21-40']++;
        else if (score <= 60) buckets['41-60']++;
        else if (score <= 80) buckets['61-80']++;
        else buckets['81-100']++;
      });

      const distribution = Object.entries(buckets).map(([range, count]) => ({
        range,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

      return {
        distribution,
        total,
        average: total > 0 ? Math.round((sum / total) * 100) / 100 : 0,
        scoreType,
      };
    } catch (error) {
      console.error('Error getting score distribution:', error);
      return { distribution: [], total: 0, average: 0, scoreType };
    }
  }

  /**
   * Get score trend analysis over time
   */
  async getScoreTrends(
    userId?: string,
    companyId?: string,
    jobId?: string,
    scoreType: 'technical' | 'communication' | 'problemSolving' | 'culturalFit' | 'overall' = 'overall',
    period?: { start: Date; end: Date },
    groupBy: 'day' | 'week' | 'month' = 'week',
  ) {
    try {
      const where: any = {
        status: 'completed',
      };

      // Build job filter
      if (userId || companyId || jobId) {
        const jobWhere: any = {};
        if (userId) jobWhere.clientId = userId;
        if (companyId) jobWhere.client = { companyId };
        if (jobId) jobWhere.id = jobId;

        const jobs = await this.prisma.job.findMany({
          where: jobWhere,
          select: { id: true },
        });
        if (jobs.length === 0) return { trends: [], scoreType };
        where.jobId = { in: jobs.map((j) => j.id) };
      }

      if (period) {
        where.completedAt = {};
        if (period.start) where.completedAt.gte = period.start;
        if (period.end) where.completedAt.lte = period.end;
      }

      const interviews = await this.prisma.interview.findMany({
        where,
        select: {
          id: true,
          completedAt: true,
          scores: true,
        },
        orderBy: { completedAt: 'asc' },
      });

      // Group by time period
      const trendsMap = new Map<string, { count: number; sum: number }>();

      interviews.forEach((interview) => {
        if (!interview.completedAt) return;
        const scores = interview.scores as any;
        if (!scores || !scores[scoreType]) return;

        const score = scores[scoreType];
        let key: string;

        const date = new Date(interview.completedAt);
        if (groupBy === 'day') {
          key = date.toISOString().split('T')[0];
        } else if (groupBy === 'week') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
        } else {
          const month = String(date.getMonth() + 1).padStart(2, '0');
          key = `${date.getFullYear()}-${month}`;
        }

        const existing = trendsMap.get(key) || { count: 0, sum: 0 };
        trendsMap.set(key, {
          count: existing.count + 1,
          sum: existing.sum + score,
        });
      });

      const trends = Array.from(trendsMap.entries())
        .map(([period, data]) => ({
          period,
          average: Math.round((data.sum / data.count) * 100) / 100,
          count: data.count,
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

      return { trends, scoreType, groupBy };
    } catch (error) {
      console.error('Error getting score trends:', error);
      return { trends: [], scoreType, groupBy };
    }
  }

  /**
   * Compare scores between this job and similar jobs
   */
  async getScoreComparison(
    jobId: string,
    userId?: string,
    companyId?: string,
    scoreType: 'technical' | 'communication' | 'problemSolving' | 'culturalFit' | 'overall' = 'overall',
  ) {
    try {
      const job = await this.prisma.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          title: true,
          requiredSkills: true,
          seniorityLevel: true,
          experienceLevel: true,
        },
      });

      if (!job) {
        throw new Error('Job not found');
      }

      // Find similar jobs (same seniority/experience level, similar skills)
      const similarJobs = await this.prisma.job.findMany({
        where: {
          id: { not: jobId },
          seniorityLevel: job.seniorityLevel,
          experienceLevel: job.experienceLevel,
          ...(userId ? { clientId: userId } : {}),
          ...(companyId ? { client: { companyId } } : {}),
        },
        select: { id: true },
        take: 10,
      });

      // Get scores for this job
      const thisJobInterviews = await this.prisma.interview.findMany({
        where: {
          jobId,
          status: 'completed',
        },
        select: {
          scores: true,
        },
      });

      const thisJobScores = thisJobInterviews
        .map((i) => (i.scores as any)?.[scoreType])
        .filter((s) => s !== undefined && s !== null);

      const thisJobAverage =
        thisJobScores.length > 0
          ? Math.round((thisJobScores.reduce((a, b) => a + b, 0) / thisJobScores.length) * 100) / 100
          : 0;

      // Get scores for similar jobs
      const similarJobIds = similarJobs.map((j) => j.id);
      const similarInterviews = await this.prisma.interview.findMany({
        where: {
          jobId: { in: similarJobIds },
          status: 'completed',
        },
        select: {
          jobId: true,
          scores: true,
        },
      });

      const similarScores = similarInterviews
        .map((i) => (i.scores as any)?.[scoreType])
        .filter((s) => s !== undefined && s !== null);

      const similarAverage =
        similarScores.length > 0
          ? Math.round((similarScores.reduce((a, b) => a + b, 0) / similarScores.length) * 100) / 100
          : 0;

      return {
        thisJob: {
          id: jobId,
          title: job.title,
          average: thisJobAverage,
          count: thisJobScores.length,
        },
        similarJobs: {
          average: similarAverage,
          count: similarScores.length,
          jobCount: similarJobs.length,
        },
        difference: Math.round((thisJobAverage - similarAverage) * 100) / 100,
        scoreType,
      };
    } catch (error) {
      console.error('Error getting score comparison:', error);
      return {
        thisJob: { id: jobId, title: '', average: 0, count: 0 },
        similarJobs: { average: 0, count: 0, jobCount: 0 },
        difference: 0,
        scoreType,
      };
    }
  }

  /**
   * Get evidence quality metrics
   */
  async getEvidenceQualityMetrics(
    userId?: string,
    companyId?: string,
    jobId?: string,
    period?: { start: Date; end: Date },
  ) {
    try {
      const where: any = {};

      // Build job filter
      if (userId || companyId || jobId) {
        const jobWhere: any = {};
        if (userId) jobWhere.clientId = userId;
        if (companyId) jobWhere.client = { companyId };
        if (jobId) jobWhere.id = jobId;

        const jobs = await this.prisma.job.findMany({
          where: jobWhere,
          select: { id: true },
        });
        if (jobs.length === 0) {
          return {
            totalScores: 0,
            scoresWithEvidence: 0,
            scoresWithoutEvidence: 0,
            averageConfidence: 0,
            confidenceDistribution: [],
            missingEvidenceByType: {},
          };
        }

        const interviewIds = await this.prisma.interview.findMany({
          where: { jobId: { in: jobs.map((j) => j.id) } },
          select: { id: true },
        });

        where.evidenceId = { in: interviewIds.map((i) => i.id) };
        where.evidenceSource = 'interview';
      }

      if (period) {
        where.createdAt = {};
        if (period.start) where.createdAt.gte = period.start;
        if (period.end) where.createdAt.lte = period.end;
      }

      const allEvidence = await this.prisma.scoreEvidence.findMany({
        where,
        select: {
          scoreId: true,
          scoreType: true,
          confidence: true,
        },
      });

      // Get unique score IDs
      const uniqueScoreIds = new Set(allEvidence.map((e) => e.scoreId));
      const totalScores = uniqueScoreIds.size;
      const scoresWithEvidence = totalScores;
      const scoresWithoutEvidence = 0; // Would need to query all scores to calculate this

      // Calculate average confidence
      const totalConfidence = allEvidence.reduce((sum, e) => sum + (e.confidence || 0), 0);
      const averageConfidence =
        allEvidence.length > 0 ? Math.round((totalConfidence / allEvidence.length) * 100) / 100 : 0;

      // Confidence distribution
      const confidenceBuckets = {
        '0-0.5': 0,
        '0.5-0.7': 0,
        '0.7-0.85': 0,
        '0.85-1.0': 0,
      };

      allEvidence.forEach((e) => {
        const conf = e.confidence || 0;
        if (conf <= 0.5) confidenceBuckets['0-0.5']++;
        else if (conf <= 0.7) confidenceBuckets['0.5-0.7']++;
        else if (conf <= 0.85) confidenceBuckets['0.7-0.85']++;
        else confidenceBuckets['0.85-1.0']++;
      });

      const confidenceDistribution = Object.entries(confidenceBuckets).map(([range, count]) => ({
        range,
        count,
        percentage: allEvidence.length > 0 ? Math.round((count / allEvidence.length) * 100) : 0,
      }));

      // Missing evidence by score type
      const missingEvidenceByType: Record<string, number> = {
        technical: 0,
        communication: 0,
        problemSolving: 0,
        culturalFit: 0,
        overall: 0,
      };

      // This would require querying all scores and comparing with evidence
      // For now, return the structure

      return {
        totalScores,
        scoresWithEvidence,
        scoresWithoutEvidence,
        averageConfidence,
        confidenceDistribution,
        missingEvidenceByType,
      };
    } catch (error) {
      console.error('Error getting evidence quality metrics:', error);
      return {
        totalScores: 0,
        scoresWithEvidence: 0,
        scoresWithoutEvidence: 0,
        averageConfidence: 0,
        confidenceDistribution: [],
        missingEvidenceByType: {},
      };
    }
  }
}
