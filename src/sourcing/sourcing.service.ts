import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidate, CandidateStatus } from '../entities/candidate.entity';
import { Job } from '../entities/job.entity';
import { ProxycurlService } from './services/proxycurl.service';
import { ScraperService } from './services/scraper.service';
import { MatchingService } from './services/matching.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class SourcingService {
  constructor(
    @InjectRepository(Candidate)
    private candidateRepository: Repository<Candidate>,
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
    private proxycurlService: ProxycurlService,
    private scraperService: ScraperService,
    private matchingService: MatchingService,
    private emailService: EmailService,
  ) {}

  async sourceFromLinkedIn(profileUrl: string, jobId: string): Promise<Candidate> {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job not found');
    }

    const profileData = await this.proxycurlService.getLinkedInProfile(profileUrl);
    const matchScore = this.matchingService.calculateMatchScore(
      profileData.skills || [],
      job,
    );

    if (!this.matchingService.shouldContact(matchScore)) {
      throw new Error(`Match score ${matchScore}% is below threshold`);
    }

    const candidate = this.candidateRepository.create({
      ...profileData,
      jobId,
      status: CandidateStatus.SOURCED,
    });

    const savedCandidate = await this.candidateRepository.save(candidate);

    // Send outreach email
    if (savedCandidate.email) {
      await this.emailService.sendInterviewInvitation(
        savedCandidate.email,
        savedCandidate.firstName,
        job.title,
      );
      savedCandidate.status = CandidateStatus.CONTACTED;
      await this.candidateRepository.save(savedCandidate);
    }

    return savedCandidate;
  }

  async sourceFromBayt(profileUrl: string, jobId: string): Promise<Candidate> {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
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

    const candidate = this.candidateRepository.create({
      ...profileData,
      jobId,
      status: CandidateStatus.SOURCED,
    });

    return await this.candidateRepository.save(candidate);
  }

  async sourceFromNaukriGulf(profileUrl: string, jobId: string): Promise<Candidate> {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job not found');
    }

    const profileData = await this.scraperService.scrapeNaukriGulfProfile(profileUrl);
    const matchScore = this.matchingService.calculateMatchScore(
      profileData.skills || [],
      job,
    );

    if (!this.matchingService.shouldContact(matchScore)) {
      throw new Error(`Match score ${matchScore}% is below threshold`);
    }

    const candidate = this.candidateRepository.create({
      ...profileData,
      jobId,
      status: CandidateStatus.SOURCED,
    });

    return await this.candidateRepository.save(candidate);
  }
}
