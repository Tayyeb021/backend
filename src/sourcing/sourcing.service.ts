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
}
