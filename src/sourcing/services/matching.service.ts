import { Injectable, Optional, Inject } from '@nestjs/common';
import { Job } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class MatchingService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    // Initialize Gemini AI if API key is available (for AI-based cultural fit)
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  calculateMatchScore(candidateSkills: string[], job: Job): number {
    if (!candidateSkills || candidateSkills.length === 0) return 0;
    if (!job.requiredSkills || job.requiredSkills.length === 0) return 0;

    const candidateSkillsLower = candidateSkills.map((s) => s.toLowerCase());
    const requiredSkillsLower = job.requiredSkills.map((s) => s.toLowerCase());

    const matchingSkills = requiredSkillsLower.filter((skill) =>
      candidateSkillsLower.some(
        (cSkill) => cSkill.includes(skill) || skill.includes(cSkill),
      ),
    );

    const matchPercentage =
      (matchingSkills.length / requiredSkillsLower.length) * 100;
    return Math.round(matchPercentage);
  }

  shouldContact(matchScore: number, threshold: number = 70): boolean {
    return matchScore >= threshold;
  }

  /**
   * Calculate cultural fit score based on multiple factors
   * Similar to how technical skill matching works, but evaluates cultural alignment
   */
  calculateCulturalFitScore(
    candidateProfile: {
      skills?: string[];
      experienceYears?: number;
      location?: string;
      profileData?: any;
    },
    job: Job,
    interviewTranscript?: string,
  ): number {
    let score = 0;
    let factors = 0;

    // Factor 1: Work Mode Alignment (20 points)
    if (job.workMode && candidateProfile.profileData?.preferredWorkMode) {
      const workModeMatch =
        job.workMode.toLowerCase() ===
        candidateProfile.profileData.preferredWorkMode.toLowerCase();
      score += workModeMatch ? 20 : 10; // Full match = 20, partial = 10
      factors += 1;
    } else {
      // Default: assume remote-friendly candidates fit all modes
      score += 15;
      factors += 1;
    }

    // Factor 2: Experience Level Alignment (20 points)
    if (job.experienceLevel && candidateProfile.experienceYears !== undefined) {
      const years = candidateProfile.experienceYears;
      let experienceScore = 0;

      switch (job.experienceLevel) {
        case 'one_to_three':
          experienceScore =
            years >= 1 && years <= 3 ? 20 : years < 1 ? 10 : 15;
          break;
        case 'three_to_five':
          experienceScore =
            years >= 3 && years <= 5 ? 20 : years < 3 ? 12 : 15;
          break;
        case 'five_plus':
          experienceScore = years >= 5 ? 20 : years >= 3 ? 15 : 10;
          break;
      }
      score += experienceScore;
      factors += 1;
    } else {
      score += 15; // Default
      factors += 1;
    }

    // Factor 3: Location/Timezone Compatibility (15 points)
    if (job.country && candidateProfile.location) {
      const locationMatch =
        candidateProfile.location
          .toLowerCase()
          .includes(job.country.toLowerCase()) ||
        job.country.toLowerCase().includes(candidateProfile.location.toLowerCase());
      score += locationMatch ? 15 : 8; // Same country = 15, different = 8
      factors += 1;
    } else {
      score += 10; // Default
      factors += 1;
    }

    // Factor 4: Job Type Alignment (15 points)
    if (job.jobType && candidateProfile.profileData?.preferredJobType) {
      const jobTypeMatch =
        job.jobType.toLowerCase() ===
        candidateProfile.profileData.preferredJobType.toLowerCase();
      score += jobTypeMatch ? 15 : 7;
      factors += 1;
    } else {
      score += 10;
      factors += 1;
    }

    // Factor 5: Engagement Length Compatibility (10 points)
    if (
      job.engagementLength &&
      candidateProfile.profileData?.preferredEngagement
    ) {
      const engagementMatch =
        job.engagementLength.toLowerCase() ===
        candidateProfile.profileData.preferredEngagement.toLowerCase();
      score += engagementMatch ? 10 : 5;
      factors += 1;
    } else {
      score += 7;
      factors += 1;
    }

    // Factor 6: Interview Transcript Analysis (20 points) - if available
    if (interviewTranscript) {
      const transcriptLower = interviewTranscript.toLowerCase();

      // Positive indicators
      const positiveKeywords = [
        'team',
        'collaborate',
        'learn',
        'growth',
        'adapt',
        'flexible',
        'communication',
        'feedback',
        'support',
        'values',
        'culture',
        'work-life balance',
        'remote',
        'autonomy',
        'ownership',
      ];

      // Negative indicators
      const negativeKeywords = [
        'micromanage',
        'rigid',
        'inflexible',
        'silo',
        'conflict',
        'stress',
        'burnout',
        'overwork',
        'toxic',
      ];

      const positiveCount = positiveKeywords.filter((keyword) =>
        transcriptLower.includes(keyword),
      ).length;

      const negativeCount = negativeKeywords.filter((keyword) =>
        transcriptLower.includes(keyword),
      ).length;

      // Calculate transcript score
      const transcriptScore = Math.min(
        20,
        Math.max(0, positiveCount * 3 - negativeCount * 5 + 10),
      );
      score += transcriptScore;
      factors += 1;
    } else {
      score += 10; // Default if no transcript
      factors += 1;
    }

    // Calculate average score
    const averageScore = factors > 0 ? score / factors : 50;

    // Normalize to 0-100 range
    return Math.round(Math.min(100, Math.max(0, averageScore)));
  }

  /**
   * Enhanced cultural fit with AI analysis (using Gemini)
   * Falls back to rule-based scoring if AI is unavailable
   */
  async calculateCulturalFitWithAI(
    transcript: string,
    jobDescription: string,
    candidateProfile: any,
    job: Job,
  ): Promise<number> {
    // If Gemini is not available, use rule-based scoring
    if (!this.genAI) {
      return this.calculateCulturalFitScore(candidateProfile, job, transcript);
    }

    try {
      // Use Gemini to analyze cultural fit from transcript
      const model = this.genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
      const prompt = `Analyze the cultural fit of a candidate based on their interview transcript.
  
  Job Description: ${jobDescription}
  Job Requirements:
  - Work Mode: ${job.workMode || 'Not specified'}
  - Experience Level: ${job.experienceLevel || 'Not specified'}
  - Job Type: ${job.jobType || 'Not specified'}
  - Engagement Length: ${job.engagementLength || 'Not specified'}
  - Country: ${job.country || 'Not specified'}
  
  Candidate Profile: ${JSON.stringify(candidateProfile)}
  Interview Transcript: ${transcript}
  
  Evaluate cultural fit based on:
  1. Alignment with company values mentioned in job description
  2. Teamwork and collaboration indicators
  3. Adaptability and flexibility
  4. Work style preferences matching job requirements
  5. Communication style
  6. Problem-solving approach
  7. Growth mindset
  8. Work mode compatibility (remote/onsite/hybrid)
  9. Experience level alignment
  10. Location/timezone compatibility
  
  Return a JSON object with:
  {
    "score": number (0-100),
    "reasoning": string,
    "strengths": string[],
    "concerns": string[]
  }
  
  Return only valid JSON, no markdown.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response
        .text()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const analysis = JSON.parse(text);

      return analysis.score || 70;
    } catch (error: any) {
      console.error('AI cultural fit analysis failed, using fallback:', error);
      // Fallback to rule-based scoring
      return this.calculateCulturalFitScore(candidateProfile, job, transcript);
    }
  }
}
