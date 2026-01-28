import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class MarketIntelligenceService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Get or create market intelligence data for a job
   */
  async getMarketIntelligence(
    jobTitle: string,
    location: string,
    experienceLevel?: string,
    industry?: string,
  ) {
    // Check if we have cached data
    const existing = await this.prisma.marketIntelligence.findFirst({
      where: {
        jobTitle,
        location,
        experienceLevel: experienceLevel || null,
      },
    });

    // Return cached if less than 7 days old
    if (existing && this.isDataFresh(existing.updatedAt)) {
      return existing;
    }

    // Fetch or generate new data
    return this.collectMarketData(jobTitle, location, experienceLevel, industry);
  }

  /**
   * Collect market data from various sources
   */
  async collectMarketData(
    jobTitle: string,
    location: string,
    experienceLevel?: string,
    industry?: string,
  ) {
    // Use AI to analyze market data
    const marketData = await this.analyzeMarketWithAI(
      jobTitle,
      location,
      experienceLevel,
      industry,
    );

    // Get real data from jobs in database
    const jobData = await this.getJobDataFromDatabase(
      jobTitle,
      location,
      experienceLevel,
    );

    // Combine AI analysis with real data
    const combinedData = this.combineMarketData(marketData, jobData);

    // Save or update
    return this.prisma.marketIntelligence.upsert({
      where: {
        jobTitle_location_experienceLevel: {
          jobTitle,
          location,
          experienceLevel: (experienceLevel || null) as any,
        },
      },
      create: {
        jobTitle,
        location,
        industry,
        experienceLevel,
        avgSalary: combinedData.avgSalary,
        minSalary: combinedData.minSalary,
        maxSalary: combinedData.maxSalary,
        demandTrend: combinedData.demandTrend,
        skillDemand: combinedData.skillDemand as any,
        marketData: combinedData.additionalData as any,
        source: 'ai_analysis',
      },
      update: {
        avgSalary: combinedData.avgSalary,
        minSalary: combinedData.minSalary,
        maxSalary: combinedData.maxSalary,
        demandTrend: combinedData.demandTrend,
        skillDemand: combinedData.skillDemand as any,
        marketData: combinedData.additionalData as any,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Analyze market using AI
   */
  private async analyzeMarketWithAI(
    jobTitle: string,
    location: string,
    experienceLevel?: string,
    industry?: string,
  ) {
    if (!this.genAI) {
      return this.getDefaultMarketData();
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = `Analyze the job market for this position in GCC/UAE region.

Job Title: ${jobTitle}
Location: ${location}
Experience Level: ${experienceLevel || 'Not specified'}
Industry: ${industry || 'Not specified'}

Provide market intelligence data in JSON format:
{
  "avgSalary": number (in AED),
  "minSalary": number,
  "maxSalary": number,
  "demandTrend": "increasing" | "stable" | "decreasing",
  "skillDemand": {
    "skill1": 0-100,
    "skill2": 0-100
  },
  "marketInsights": {
    "summary": "brief market summary",
    "trends": ["trend1", "trend2"],
    "opportunities": ["opp1", "opp2"]
  }
}

Return only valid JSON, no markdown.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response
        .text()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const data = JSON.parse(text);

      return {
        avgSalary: data.avgSalary || 0,
        minSalary: data.minSalary || 0,
        maxSalary: data.maxSalary || 0,
        demandTrend: data.demandTrend || 'stable',
        skillDemand: data.skillDemand || {},
        additionalData: data.marketInsights || {},
      };
    } catch (error: any) {
      console.error('AI market analysis failed:', error);
      return this.getDefaultMarketData();
    }
  }

  /**
   * Get job data from database
   */
  private async getJobDataFromDatabase(
    jobTitle: string,
    location: string,
    experienceLevel?: string,
  ) {
    const where: any = {
      title: { contains: jobTitle, mode: 'insensitive' },
      country: location,
    };

    if (experienceLevel) {
      where.experienceLevel = experienceLevel;
    }

    const jobs = await this.prisma.job.findMany({
      where,
      select: {
        minSalary: true,
        maxSalary: true,
        requiredSkills: true,
        status: true,
      },
    });

    if (jobs.length === 0) {
      return null;
    }

    const salaries = jobs
      .filter((j) => j.minSalary && j.maxSalary)
      .map((j) => ({ min: j.minSalary!, max: j.maxSalary! }));

    const avgSalary =
      salaries.length > 0
        ? salaries.reduce(
            (sum, s) => sum + (s.min + s.max) / 2,
            0,
          ) / salaries.length
        : 0;

    const minSalary = Math.min(...salaries.map((s) => s.min));
    const maxSalary = Math.max(...salaries.map((s) => s.max));

    // Count skill demand
    const skillCounts: Record<string, number> = {};
    jobs.forEach((job) => {
      job.requiredSkills.forEach((skill) => {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      });
    });

    const totalJobs = jobs.length;
    const skillDemand: Record<string, number> = {};
    Object.keys(skillCounts).forEach((skill) => {
      skillDemand[skill] = Math.round(
        (skillCounts[skill] / totalJobs) * 100,
      );
    });

    return {
      avgSalary,
      minSalary,
      maxSalary,
      skillDemand,
      jobCount: jobs.length,
    };
  }

  /**
   * Combine AI data with database data
   */
  private combineMarketData(aiData: any, dbData: any) {
    if (!dbData) {
      return aiData;
    }

    // Use database data if available, otherwise use AI
    return {
      avgSalary: dbData.avgSalary || aiData.avgSalary,
      minSalary: dbData.minSalary || aiData.minSalary,
      maxSalary: dbData.maxSalary || aiData.maxSalary,
      demandTrend: aiData.demandTrend,
      skillDemand: { ...aiData.skillDemand, ...dbData.skillDemand },
      additionalData: {
        ...aiData.additionalData,
        jobCount: dbData.jobCount,
        dataSource: 'combined',
      },
    };
  }

  /**
   * Get default market data when AI unavailable
   */
  private getDefaultMarketData() {
    return {
      avgSalary: 15000,
      minSalary: 10000,
      maxSalary: 20000,
      demandTrend: 'stable',
      skillDemand: {},
      additionalData: {},
    };
  }

  /**
   * Check if data is fresh (less than 7 days old)
   */
  private isDataFresh(updatedAt: Date): boolean {
    const daysSinceUpdate =
      (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate < 7;
  }

  /**
   * Get salary benchmarking data
   */
  async getSalaryBenchmark(
    jobTitle: string,
    location: string,
    experienceLevel?: string,
  ) {
    const data = await this.getMarketIntelligence(
      jobTitle,
      location,
      experienceLevel,
    );

    return {
      jobTitle,
      location,
      experienceLevel,
      avgSalary: data.avgSalary,
      minSalary: data.minSalary,
      maxSalary: data.maxSalary,
      percentile25: data.minSalary,
      percentile50: data.avgSalary,
      percentile75: data.maxSalary,
      currency: 'AED',
    };
  }

  /**
   * Get skills demand trends
   */
  async getSkillsDemandTrend(
    jobTitle: string,
    location: string,
  ): Promise<Record<string, number>> {
    const data = await this.getMarketIntelligence(jobTitle, location);
    return (data.skillDemand as Record<string, number>) || {};
  }

  /**
   * Get market trends
   */
  async getMarketTrends(
    jobTitle: string,
    location: string,
  ): Promise<{
    demandTrend: string;
    insights: any;
  }> {
    const data = await this.getMarketIntelligence(jobTitle, location);
    return {
      demandTrend: data.demandTrend || 'stable',
      insights: data.marketData || {},
    };
  }
}
