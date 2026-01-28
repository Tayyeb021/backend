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
    const where: any = {};
    if (userId) where.clientId = userId;
    if (companyId) {
      const jobs = await this.prisma.job.findMany({
        where: { client: { companyId } },
        select: { id: true },
      });
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
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (candidates.length === 0) return 0;

    const totalDays = candidates.reduce((sum, candidate) => {
      if (candidate.interviews.length === 0) return sum;
      const firstInterview = candidate.interviews[0];
      const daysDiff =
        (candidate.updatedAt.getTime() - firstInterview.createdAt.getTime()) /
        (1000 * 60 * 60 * 24);
      return sum + daysDiff;
    }, 0);

    return Math.round(totalDays / candidates.length);
  }

  /**
   * Calculate cost-per-hire
   */
  async calculateCostPerHire(
    userId?: string,
    companyId?: string,
    period?: { start: Date; end: Date },
  ): Promise<number> {
    // Base costs (can be configured per company)
    const baseCosts = {
      sourcing: 500, // AED per candidate
      interview: 200, // AED per interview
      admin: 300, // AED per hire
    };

    const where: any = {};
    if (userId) where.clientId = userId;
    if (companyId) {
      const jobs = await this.prisma.job.findMany({
        where: { client: { companyId } },
        select: { id: true },
      });
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
  }

  /**
   * Calculate quality-of-hire score
   */
  async calculateQualityOfHire(
    userId?: string,
    companyId?: string,
    period?: { start: Date; end: Date },
  ): Promise<number> {
    const where: any = {};
    if (userId) where.clientId = userId;
    if (companyId) {
      const jobs = await this.prisma.job.findMany({
        where: { client: { companyId } },
        select: { id: true },
      });
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
  }

  /**
   * Calculate interview-to-offer conversion rate
   */
  async calculateInterviewToOfferRate(
    userId?: string,
    companyId?: string,
    period?: { start: Date; end: Date },
  ): Promise<number> {
    const where: any = {};
    if (userId) where.clientId = userId;
    if (companyId) {
      const jobs = await this.prisma.job.findMany({
        where: { client: { companyId } },
        select: { id: true },
      });
      where.jobId = { in: jobs.map((j) => j.id) };
    }
    if (period) {
      where.createdAt = {
        gte: period.start,
        lte: period.end,
      };
    }

    const totalInterviews = await this.prisma.interview.count({
      where: {
        ...where,
        status: 'completed',
      },
    });

    const offers = await this.prisma.candidate.count({
      where: {
        ...where,
        status: 'advanced',
      },
    });

    if (totalInterviews === 0) return 0;
    return Math.round((offers / totalInterviews) * 100);
  }

  /**
   * Calculate source effectiveness
   */
  async calculateSourceEffectiveness(
    userId?: string,
    companyId?: string,
  ): Promise<any[]> {
    const where: any = {};
    if (userId) {
      const jobs = await this.prisma.job.findMany({
        where: { clientId: userId },
        select: { id: true },
      });
      where.jobId = { in: jobs.map((j) => j.id) };
    }
    if (companyId) {
      const jobs = await this.prisma.job.findMany({
        where: { client: { companyId } },
        select: { id: true },
      });
      where.jobId = { in: jobs.map((j) => j.id) };
    }

    const candidates = await this.prisma.candidate.findMany({
      where,
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
        sourceStats[source].avgScore =
          (sourceStats[source].avgScore * (sourceStats[source].interviewed - 1) +
            avgScore) /
          sourceStats[source].interviewed;
      }
      if (candidate.status === 'advanced') {
        sourceStats[source].advanced++;
      }
    });

    return Object.values(sourceStats).map((stat: any) => ({
      ...stat,
      conversionRate:
        stat.total > 0 ? Math.round((stat.advanced / stat.total) * 100) : 0,
      interviewRate:
        stat.total > 0 ? Math.round((stat.interviewed / stat.total) * 100) : 0,
    }));
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
    const timeToHire = await this.calculateTimeToHire(
      userId,
      companyId,
      period?.start,
      period?.end,
    );
    const costPerHire = await this.calculateCostPerHire(
      userId,
      companyId,
      period,
    );
    const qualityOfHire = await this.calculateQualityOfHire(
      userId,
      companyId,
      period,
    );
    const interviewToOfferRate = await this.calculateInterviewToOfferRate(
      userId,
      companyId,
      period,
    );
    const sourceEffectiveness = await this.calculateSourceEffectiveness(
      userId,
      companyId,
    );

    return {
      timeToHire,
      costPerHire,
      qualityOfHire,
      interviewToOfferRate,
      sourceEffectiveness,
      period: period || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        end: new Date(),
      },
    };
  }
}
