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
    // Check if we have cached data (normalize experienceLevel for lookup)
    const normalizedExperienceLevel = experienceLevel || 'all';
    const existing = await this.prisma.marketIntelligence.findUnique({
      where: {
        jobTitle_location_experienceLevel: {
          jobTitle,
          location,
          experienceLevel: normalizedExperienceLevel,
        },
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

    // Use 'all' as default for experienceLevel to avoid null in unique constraint
    const normalizedExperienceLevel = experienceLevel || 'all';

    // Check if record exists first
    const existing = await this.prisma.marketIntelligence.findUnique({
      where: {
        jobTitle_location_experienceLevel: {
          jobTitle,
          location,
          experienceLevel: normalizedExperienceLevel,
        },
      },
    });

    if (existing) {
      // Update existing record
      return this.prisma.marketIntelligence.update({
        where: {
          jobTitle_location_experienceLevel: {
            jobTitle,
            location,
            experienceLevel: normalizedExperienceLevel,
          },
        },
        data: {
          avgSalary: combinedData.avgSalary,
          minSalary: combinedData.minSalary,
          maxSalary: combinedData.maxSalary,
          demandTrend: combinedData.demandTrend,
          skillDemand: combinedData.skillDemand as any,
          marketData: combinedData.additionalData as any,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new record
      return this.prisma.marketIntelligence.create({
        data: {
          jobTitle,
          location,
          industry: industry || null,
          experienceLevel: normalizedExperienceLevel,
          avgSalary: combinedData.avgSalary,
          minSalary: combinedData.minSalary,
          maxSalary: combinedData.maxSalary,
          demandTrend: combinedData.demandTrend,
          skillDemand: combinedData.skillDemand as any,
          marketData: combinedData.additionalData as any,
          source: 'ai_analysis',
        },
      });
    }
  }

  /**
   * Analyze market using AI - Generic for all locations
   */
  private async analyzeMarketWithAI(
    jobTitle: string,
    location: string,
    experienceLevel?: string,
    industry?: string,
  ) {
    if (!this.genAI) {
      return this.getDefaultMarketData(location);
    }

    try {
      // Use gemini-1.5-flash for faster responses, or gemini-1.5-pro for better quality
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Determine currency based on location
      const currency = this.getCurrencyForLocation(location);
      
      const prompt = `You are a market intelligence analyst. Analyze the current job market data for the following position and provide comprehensive market intelligence.

Job Title: ${jobTitle}
Location: ${location}
Experience Level: ${experienceLevel || 'Not specified'}
Industry: ${industry || 'Not specified'}

Based on current market data, job postings, salary surveys, and industry reports for ${location}, extract and provide the following information:

1. Salary Range: Provide realistic salary figures in ${currency} based on the location's market rates. Consider:
   - Cost of living in ${location}
   - Industry standards for ${location}
   - Experience level impact on salary
   - Current market conditions

2. Demand Trend: Analyze if demand for this role is increasing, stable, or decreasing based on:
   - Job posting trends
   - Industry growth
   - Economic factors in ${location}

3. Skills Demand: Identify the top 8-12 most in-demand skills for this role in ${location}, with demand percentages (0-100) based on:
   - Frequency in job postings
   - Industry requirements
   - Emerging technologies

4. Market Insights: Provide actionable insights including:
   - Market summary
   - Key trends
   - Opportunities
   - Challenges

Return ONLY valid JSON in this exact format (no markdown, no code blocks, no explanations):
{
  "avgSalary": <number>,
  "minSalary": <number>,
  "maxSalary": <number>,
  "demandTrend": "increasing" | "stable" | "decreasing",
  "skillDemand": {
    "<skill_name>": <0-100>,
    "<skill_name>": <0-100>
  },
  "marketInsights": {
    "summary": "<brief market summary for this role in this location>",
    "trends": ["<trend1>", "<trend2>", "<trend3>"],
    "opportunities": ["<opportunity1>", "<opportunity2>"],
    "challenges": ["<challenge1>", "<challenge2>"],
    "currency": "${currency}",
    "location": "${location}"
  }
}

Important: 
- Use realistic, data-driven figures based on ${location} market
- Ensure minSalary < avgSalary < maxSalary
- Skill demand percentages should sum to a reasonable total
- Be specific to ${location} market conditions
- Return ONLY the JSON object, nothing else`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();
      
      // Clean up the response
      text = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[^{]*/, '') // Remove any text before first {
        .replace(/[^}]*$/, '') // Remove any text after last }
        .trim();
      
      // Try to extract JSON if wrapped
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }
      
      const data = JSON.parse(text);

      return {
        avgSalary: data.avgSalary || 0,
        minSalary: data.minSalary || 0,
        maxSalary: data.maxSalary || 0,
        demandTrend: data.demandTrend || 'stable',
        skillDemand: data.skillDemand || {},
        additionalData: {
          ...(data.marketInsights || {}),
          currency: currency,
          location: location,
        },
      };
    } catch (error: any) {
      console.error('AI market analysis failed:', error);
      console.error('Response text:', error.response?.text || error.message);
      return this.getDefaultMarketData(location);
    }
  }

  /**
   * Get currency for location
   */
  private getCurrencyForLocation(location: string): string {
    const locationUpper = location.toUpperCase();
    
    // GCC countries
    if (locationUpper.includes('UAE') || locationUpper.includes('UNITED ARAB EMIRATES') || locationUpper.includes('DUBAI') || locationUpper.includes('ABU DHABI')) {
      return 'AED';
    }
    if (locationUpper.includes('SAUDI') || locationUpper.includes('KSA') || locationUpper.includes('RIYADH')) {
      return 'SAR';
    }
    if (locationUpper.includes('KUWAIT')) {
      return 'KWD';
    }
    if (locationUpper.includes('BAHRAIN')) {
      return 'BHD';
    }
    if (locationUpper.includes('OMAN')) {
      return 'OMR';
    }
    if (locationUpper.includes('QATAR') || locationUpper.includes('DOHA')) {
      return 'QAR';
    }
    
    // Other common locations
    if (locationUpper.includes('USA') || locationUpper.includes('UNITED STATES') || locationUpper.includes('US')) {
      return 'USD';
    }
    if (locationUpper.includes('UK') || locationUpper.includes('UNITED KINGDOM') || locationUpper.includes('LONDON')) {
      return 'GBP';
    }
    if (locationUpper.includes('EUROPE') || locationUpper.includes('EU')) {
      return 'EUR';
    }
    if (locationUpper.includes('INDIA') || locationUpper.includes('MUMBAI') || locationUpper.includes('BANGALORE')) {
      return 'INR';
    }
    if (locationUpper.includes('SINGAPORE')) {
      return 'SGD';
    }
    if (locationUpper.includes('AUSTRALIA') || locationUpper.includes('SYDNEY')) {
      return 'AUD';
    }
    if (locationUpper.includes('CANADA') || locationUpper.includes('TORONTO')) {
      return 'CAD';
    }
    
    // Default to AED for GCC region or unknown
    return 'AED';
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
  private getDefaultMarketData(location: string = 'UAE') {
    const currency = this.getCurrencyForLocation(location);
    // Default values in AED, will be converted if needed
    const baseAvg = 15000;
    const baseMin = 10000;
    const baseMax = 20000;
    
    return {
      avgSalary: baseAvg,
      minSalary: baseMin,
      maxSalary: baseMax,
      demandTrend: 'stable',
      skillDemand: {},
      additionalData: {
        currency: currency,
        location: location,
        summary: 'Market data unavailable. Please try again or check your input.',
      },
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

    const currency = this.getCurrencyForLocation(location);
    const marketData = data.marketData as any || {};
    const dataCurrency = marketData.currency || currency;

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
      currency: dataCurrency,
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
