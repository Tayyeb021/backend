import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../interview/services/gemini.service';
import { MatchingService } from '../sourcing/services/matching.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class InsightsService {
  constructor(
    private prisma: PrismaService,
    private geminiService: GeminiService,
    private matchingService: MatchingService,
  ) {}

  /**
   * Calculate comprehensive AI-powered insights for a candidate
   */
  async calculateCandidateInsights(
    candidateId: string,
    jobId?: string,
  ): Promise<any> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        job: true,
        interviews: {
          where: { status: 'completed' },
          orderBy: { completedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    const job = jobId
      ? await this.prisma.job.findUnique({ where: { id: jobId } })
      : candidate.job;

    if (!job) {
      throw new Error('Job not found');
    }

    // Calculate base scores
    const matchScore = this.matchingService.calculateMatchScore(
      candidate.skills || [],
      job,
    );

    // Get interview scores
    const interviewScores = candidate.interviews
      .map((i) => (i.scores as any)?.overall || 0)
      .filter((s) => s > 0);
    const avgInterviewScore =
      interviewScores.length > 0
        ? interviewScores.reduce((a, b) => a + b, 0) / interviewScores.length
        : 0;

    // Calculate success probability (0-100)
    const successProbability = this.calculateSuccessProbability(
      matchScore,
      avgInterviewScore,
      candidate.experienceYears || 0,
      job,
    );

    // Calculate retention risk (0-100, lower is better)
    const retentionRisk = await this.calculateRetentionRisk(
      candidate,
      job,
      candidate.interviews,
    );

    // Calculate team fit score
    const teamFitScore = await this.calculateTeamFitScore(
      candidate,
      job,
      candidate.interviews,
    );

    // Predict time to productivity (days)
    const timeToProductivity = this.predictTimeToProductivity(
      candidate.experienceYears || 0,
      matchScore,
      avgInterviewScore,
    );

    // Estimate salary expectation
    const salaryExpectation = this.estimateSalaryExpectation(
      candidate,
      job,
      candidate.location ?? undefined,
    );

    // Generate AI insights using Gemini
    const aiInsights = await this.generateAIInsights(
      candidate,
      job,
      {
        successProbability,
        retentionRisk,
        teamFitScore,
        matchScore,
        avgInterviewScore,
      },
      candidate.interviews,
    );

    // Save or update insights
    const finalJobId = jobId || job.id;
    
    // Check if insight exists
    const existing = await this.prisma.candidateInsight.findFirst({
      where: {
        candidateId,
        jobId: finalJobId,
      },
    });

    if (existing) {
      // Update existing
      return this.prisma.candidateInsight.update({
        where: { id: existing.id },
        data: {
          successProbability,
          retentionRisk,
          teamFitScore,
          timeToProductivity,
          salaryExpectation: salaryExpectation as any,
          strengths: aiInsights.strengths,
          risks: aiInsights.risks,
          recommendations: aiInsights.recommendations,
          insights: aiInsights.additionalInsights as any,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new
      return this.prisma.candidateInsight.create({
        data: {
          candidateId,
          jobId: finalJobId,
          successProbability,
          retentionRisk,
          teamFitScore,
          timeToProductivity,
          salaryExpectation: salaryExpectation as any,
          strengths: aiInsights.strengths,
          risks: aiInsights.risks,
          recommendations: aiInsights.recommendations,
          insights: aiInsights.additionalInsights as any,
        },
      });
    }
  }

  /**
   * Calculate success probability based on multiple factors
   */
  private calculateSuccessProbability(
    matchScore: number,
    interviewScore: number,
    experienceYears: number,
    job: any,
  ): number {
    // Base score from match
    let probability = matchScore * 0.4;

    // Interview performance (40% weight)
    probability += interviewScore * 0.4;

    // Experience alignment (20% weight)
    const experienceScore = this.calculateExperienceAlignment(
      experienceYears,
      job.experienceLevel,
    );
    probability += experienceScore * 0.2;

    // Normalize to 0-100
    return Math.round(Math.min(100, Math.max(0, probability)));
  }

  /**
   * Calculate experience alignment score
   */
  private calculateExperienceAlignment(
    years: number,
    level: string,
  ): number {
    switch (level) {
      case 'one_to_three':
        return years >= 1 && years <= 3 ? 100 : years < 1 ? 60 : 80;
      case 'three_to_five':
        return years >= 3 && years <= 5 ? 100 : years < 3 ? 70 : 85;
      case 'five_plus':
        return years >= 5 ? 100 : years >= 3 ? 80 : 60;
      default:
        return 75;
    }
  }

  /**
   * Calculate retention risk using AI analysis
   */
  private async calculateRetentionRisk(
    candidate: any,
    job: any,
    interviews: any[],
  ): Promise<number> {
    // Base risk factors
    let risk = 50; // Default medium risk

    // Job hopping indicator (if available in profile data)
    const profileData = candidate.profileData || {};
    if (profileData.jobHistory) {
      const avgTenure =
        profileData.jobHistory.reduce(
          (sum: number, job: any) => sum + (job.tenureMonths || 0),
          0,
        ) / profileData.jobHistory.length;
      if (avgTenure < 12) risk += 20; // High job hopping
      if (avgTenure < 24) risk += 10;
    }

    // Location mismatch
    if (candidate.location && job.country) {
      if (
        !candidate.location
          .toLowerCase()
          .includes(job.country.toLowerCase())
      ) {
        risk += 15;
      }
    }

    // Work mode mismatch
    if (profileData.preferredWorkMode && job.workMode) {
      if (profileData.preferredWorkMode !== job.workMode) {
        risk += 10;
      }
    }

    // Analyze interview responses for retention signals
    if (interviews.length > 0) {
      const transcripts = interviews
        .map((i) => i.transcript)
        .filter((t) => t)
        .join(' ');
      if (transcripts) {
        const riskKeywords = [
          'looking for change',
          'better opportunity',
          'higher salary',
          'not satisfied',
          'considering options',
        ];
        const riskCount = riskKeywords.filter((keyword) =>
          transcripts.toLowerCase().includes(keyword),
        ).length;
        risk += riskCount * 5;
      }
    }

    return Math.round(Math.min(100, Math.max(0, risk)));
  }

  /**
   * Calculate team fit score
   */
  private async calculateTeamFitScore(
    candidate: any,
    job: any,
    interviews: any[],
  ): Promise<number> {
    // Use cultural fit from interviews if available
    if (interviews.length > 0) {
      const culturalFitScores = interviews
        .map((i) => (i.scores as any)?.culturalFit || 0)
        .filter((s) => s > 0);
      if (culturalFitScores.length > 0) {
        const avgCulturalFit =
          culturalFitScores.reduce((a, b) => a + b, 0) /
          culturalFitScores.length;
        return Math.round(avgCulturalFit);
      }
    }

    // Fallback to matching service
    const culturalFit = this.matchingService.calculateCulturalFitScore(
      {
        skills: candidate.skills || [],
        experienceYears: candidate.experienceYears,
        location: candidate.location,
        profileData: candidate.profileData,
      },
      job,
    );

    return culturalFit;
  }

  /**
   * Predict time to productivity in days
   */
  private predictTimeToProductivity(
    experienceYears: number,
    matchScore: number,
    interviewScore: number,
  ): number {
    // Base time based on experience
    let days = 90; // Default 3 months

    // Reduce time based on experience
    if (experienceYears >= 5) days -= 30;
    else if (experienceYears >= 3) days -= 15;
    else if (experienceYears < 1) days += 30;

    // Reduce time based on match score
    if (matchScore >= 90) days -= 20;
    else if (matchScore >= 80) days -= 10;
    else if (matchScore < 70) days += 15;

    // Reduce time based on interview performance
    if (interviewScore >= 85) days -= 15;
    else if (interviewScore >= 75) days -= 5;
    else if (interviewScore < 60) days += 20;

    return Math.max(30, Math.min(180, days)); // Between 1-6 months
  }

  /**
   * Estimate salary expectation
   */
  private estimateSalaryExpectation(
    candidate: any,
    job: any,
    location?: string,
  ): { min: number; max: number; currency: string } {
    const currency = job.currency || 'AED';
    const jobMin = job.minSalary || 0;
    const jobMax = job.maxSalary || 0;
    const jobMid = (jobMin + jobMax) / 2;

    // Base expectation on job range
    let min = jobMin * 0.9; // 10% below min
    let max = jobMax * 1.1; // 10% above max

    // Adjust based on experience
    const experienceYears = candidate.experienceYears || 0;
    if (experienceYears >= 5) {
      min = jobMid * 1.1;
      max = jobMax * 1.2;
    } else if (experienceYears >= 3) {
      min = jobMin;
      max = jobMax;
    } else {
      min = jobMin * 0.85;
      max = jobMid;
    }

    return {
      min: Math.round(min),
      max: Math.round(max),
      currency,
    };
  }

  /**
   * Generate AI-powered insights using Gemini
   */
  private async generateAIInsights(
    candidate: any,
    job: any,
    scores: any,
    interviews: any[],
  ): Promise<{
    strengths: string[];
    risks: string[];
    recommendations: string[];
    additionalInsights: any;
  }> {
    try {
      const interviewSummaries = interviews
        .map((i) => i.aiSummary || '')
        .filter((s) => s)
        .join('\n\n');

      const prompt = `Analyze this candidate for the job position and provide insights.

Candidate Profile:
- Name: ${candidate.firstName} ${candidate.lastName}
- Experience: ${candidate.experienceYears || 0} years
- Location: ${candidate.location || 'Not specified'}
- Skills: ${(candidate.skills || []).join(', ')}
- Status: ${candidate.status}

Job Requirements:
- Title: ${job.title}
- Experience Level: ${job.experienceLevel}
- Work Mode: ${job.workMode}
- Location: ${job.country || 'Not specified'}

Scores:
- Match Score: ${scores.matchScore}%
- Success Probability: ${scores.successProbability}%
- Retention Risk: ${scores.retentionRisk}% (lower is better)
- Team Fit: ${scores.teamFitScore}%
- Interview Average: ${scores.avgInterviewScore}%

Interview Summaries:
${interviewSummaries || 'No interview summaries available'}

Provide a JSON response with:
{
  "strengths": ["strength1", "strength2", ...],
  "risks": ["risk1", "risk2", ...],
  "recommendations": ["recommendation1", "recommendation2", ...],
  "additionalInsights": {
    "summary": "brief summary",
    "keyHighlights": ["highlight1", "highlight2"],
    "concerns": ["concern1", "concern2"]
  }
}

Return only valid JSON, no markdown.`;

      // Access Gemini AI directly
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return this.generateRuleBasedInsights(candidate, job, scores);
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response
        .text()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const insights = JSON.parse(text);

      return {
        strengths: insights.strengths || [],
        risks: insights.risks || [],
        recommendations: insights.recommendations || [],
        additionalInsights: insights.additionalInsights || {},
      };
    } catch (error: any) {
      console.error('AI insights generation failed:', error);
      return this.generateRuleBasedInsights(candidate, job, scores);
    }
  }

  /**
   * Fallback rule-based insights
   */
  private generateRuleBasedInsights(
    candidate: any,
    job: any,
    scores: any,
  ): {
    strengths: string[];
    risks: string[];
    recommendations: string[];
    additionalInsights: any;
  } {
    const strengths: string[] = [];
    const risks: string[] = [];
    const recommendations: string[] = [];

    // Strengths
    if (scores.matchScore >= 80) {
      strengths.push('Strong skill match with job requirements');
    }
    if (scores.avgInterviewScore >= 80) {
      strengths.push('Excellent interview performance');
    }
    if (candidate.experienceYears && candidate.experienceYears >= 3) {
      strengths.push('Relevant experience level');
    }

    // Risks
    if (scores.retentionRisk >= 70) {
      risks.push('Higher retention risk - consider discussing long-term goals');
    }
    if (scores.matchScore < 70) {
      risks.push('Skill gap may require additional training');
    }
    if (scores.teamFitScore < 60) {
      risks.push('Cultural fit may need further assessment');
    }

    // Recommendations
    if (scores.successProbability >= 80) {
      recommendations.push('Strong candidate - recommend moving forward');
    } else if (scores.successProbability >= 60) {
      recommendations.push('Good candidate - consider additional interview round');
    } else {
      recommendations.push('Evaluate carefully - may need skill development');
    }

    return {
      strengths,
      risks,
      recommendations,
      additionalInsights: {
        summary: `Candidate shows ${scores.successProbability >= 70 ? 'strong' : 'moderate'} potential for success in this role.`,
        keyHighlights: strengths.slice(0, 3),
        concerns: risks.slice(0, 2),
      },
    };
  }

  /**
   * Get insights for a candidate
   */
  async getCandidateInsights(candidateId: string, jobId?: string) {
    // Try to find existing insight
    let insight: any = null;
    
    if (jobId) {
      // Try with specific jobId first
      insight = await this.prisma.candidateInsight.findFirst({
        where: {
          candidateId,
          jobId,
        },
        orderBy: { calculatedAt: 'desc' },
      });
    }
    
    // If not found, try without jobId
    if (!insight) {
      insight = await this.prisma.candidateInsight.findFirst({
        where: {
          candidateId,
          jobId: jobId || null,
        },
        orderBy: { calculatedAt: 'desc' },
      });
    }

    // Calculate if not exists or older than 24 hours
    if (!insight || this.isInsightStale(insight.calculatedAt)) {
      insight = await this.calculateCandidateInsights(candidateId, jobId);
    }

    return insight;
  }
  /**
   * Check if insight is stale (older than 24 hours)
   */
  private isInsightStale(calculatedAt: Date): boolean {
    const hoursSinceCalculation =
      (Date.now() - calculatedAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceCalculation > 24;
  }
}
