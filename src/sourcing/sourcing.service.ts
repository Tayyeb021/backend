import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Candidate, CandidateStatus } from '@prisma/client';
import { ProxycurlService } from './services/proxycurl.service';
import { ScraperService } from './services/scraper.service';
import { MatchingService } from './services/matching.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class SourcingService {
  constructor(
    private prisma: PrismaService,
    private proxycurlService: ProxycurlService,
    private scraperService: ScraperService,
    private matchingService: MatchingService,
    private emailService: EmailService,
  ) {}

  async sourceFromLinkedIn(
    profileUrl: string,
    jobId: string,
  ): Promise<Candidate> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job not found');
    }

    const profileData =
      await this.proxycurlService.getLinkedInProfile(profileUrl);
    const matchScore = this.matchingService.calculateMatchScore(
      profileData.skills || [],
      job,
    );

    if (!this.matchingService.shouldContact(matchScore)) {
      throw new Error(`Match score ${matchScore}% is below threshold`);
    }

    const savedCandidate = await this.prisma.candidate.create({
      data: {
        ...profileData,
        jobId,
        status: CandidateStatus.sourced,
      },
    });

    // Send outreach email
    if (savedCandidate.email) {
      await this.emailService.sendInterviewInvitation(
        savedCandidate.email,
        savedCandidate.firstName,
        job.title,
      );
      return await this.prisma.candidate.update({
        where: { id: savedCandidate.id },
        data: { status: CandidateStatus.contacted },
      });
    }

    return savedCandidate;
  }

  async sourceFromBayt(profileUrl: string, jobId: string): Promise<Candidate> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job not found');
    }

    const profileData = await this.scraperService.scrapeBaytProfile(profileUrl);
    const matchScore = this.matchingService.calculateMatchScore(
      profileData.skills || [],
      job,
    );

    if (!this.matchingService.shouldContact(matchScore)) {
      throw new Error(`Match score ${matchScore}% is below threshold`);
    }

    return await this.prisma.candidate.create({
      data: {
        ...profileData,
        jobId,
        status: CandidateStatus.sourced,
      },
    });
  }

  async sourceFromNaukriGulf(
    profileUrl: string,
    jobId: string,
  ): Promise<Candidate> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job not found');
    }

    const profileData =
      await this.scraperService.scrapeNaukriGulfProfile(profileUrl);
    const matchScore = this.matchingService.calculateMatchScore(
      profileData.skills || [],
      job,
    );

    if (!this.matchingService.shouldContact(matchScore)) {
      throw new Error(`Match score ${matchScore}% is below threshold`);
    }

    return await this.prisma.candidate.create({
      data: {
        ...profileData,
        jobId,
        status: CandidateStatus.sourced,
      },
    });
  }

  /**
   * Extract candidates from job description by matching existing candidates
   */
  async extractCandidatesFromJob(
    jobId: string,
    numResults: number = 10,
  ): Promise<Candidate[]> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job not found');
    }

    // Get all candidates that haven't been interviewed for this job
    const allCandidates = await this.prisma.candidate.findMany({
      where: {
        NOT: {
          interviews: {
            some: {
              jobId,
            },
          },
        },
      },
      include: {
        job: true,
      },
    });

    // Match candidates to this job
    const matchedCandidates = allCandidates
      .map((candidate) => ({
        candidate,
        matchScore: this.matchingService.calculateMatchScore(
          candidate.skills || [],
          job,
        ),
      }))
      .filter(({ matchScore }) =>
        this.matchingService.shouldContact(matchScore, 50), // Lower threshold for extraction
      )
      .sort((a, b) => b.matchScore - a.matchScore) // Sort by match score descending
      .slice(0, numResults) // Limit to requested number
      .map(({ candidate }) => candidate);

    // If candidates are not already associated with this job, update them
    const results = await Promise.all(
      matchedCandidates.map(async (candidate) => {
        if (candidate.jobId !== jobId) {
          // Create a new candidate entry for this job or update existing
          const existing = await this.prisma.candidate.findFirst({
            where: {
              email: candidate.email,
              jobId,
            },
          });

          if (existing) {
            return existing;
          }

          // Create new candidate entry for this job
          return await this.prisma.candidate.create({
            data: {
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              email: candidate.email,
              phone: candidate.phone,
              skills: candidate.skills,
              resumeUrl: candidate.resumeUrl,
              jobId,
              status: CandidateStatus.sourced,
            },
          });
        }
        return candidate;
      }),
    );

    return results;
  }
}
