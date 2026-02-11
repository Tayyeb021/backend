import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../sourcing/services/matching.service';
import { InterviewService } from '../interview/interview.service';
import { EmailService } from '../email/email.service';
import { InterviewLanguage, InterviewType, CandidateStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { generateSecurePassword } from '../candidates/utils/password.utils';

interface DateOption {
  date: string; // ISO string
  selected: boolean;
}

@Injectable()
export class JobsAutoInviteService {
  constructor(
    private prisma: PrismaService,
    private matchingService: MatchingService,
    @Inject(forwardRef(() => InterviewService))
    private interviewService: InterviewService,
    private emailService: EmailService,
  ) {}

  /**
   * Match candidates from database to a job and send interview invitations
   */
  async autoInviteCandidates(
    jobId: string,
    clientId: string,
    options: {
      language?: InterviewLanguage;
      type?: InterviewType;
      templateId?: string;
      daysAhead?: number[]; // Days from now to generate date options
      maxCandidates?: number; // Maximum number of candidates to invite (default: 10)
    } = {},
  ) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Get all candidates from database
    // Filter out candidates already interviewed for this job
    const allCandidates = await this.prisma.candidate.findMany({
      where: {
        // Only candidates not already interviewed for this job
        NOT: {
          interviews: {
            some: {
              jobId,
            },
          },
        },
      },
    });

    // Match candidates to job
    const matchedCandidates = allCandidates
      .map((candidate) => ({
        candidate,
        matchScore: this.matchingService.calculateMatchScore(
          candidate.skills || [],
          job,
        ),
      }))
      .filter(({ matchScore }) =>
        this.matchingService.shouldContact(matchScore, 70),
      )
      .sort((a, b) => b.matchScore - a.matchScore) // Sort by match score descending
      .slice(0, options.maxCandidates || 10); // Limit to specified number (default: 10)

    if (matchedCandidates.length === 0) {
      return {
        message: 'No matching candidates found (70%+ match required)',
        invited: 0,
        invitations: [],
      };
    }

    // Log matching results
    const maxToInvite = options.maxCandidates || 10;
    console.log(
      `Found ${matchedCandidates.length} matched candidates for job ${jobId}. Inviting top ${Math.min(maxToInvite, matchedCandidates.length)}.`,
    );

    // Generate 3 date options (default: 3, 5, 7 days from now)
    const daysAhead = options.daysAhead || [3, 5, 7];
    const dateOptions: DateOption[] = daysAhead.map((days) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      date.setHours(10, 0, 0, 0); // Set to 10 AM
      return {
        date: date.toISOString(),
        selected: false,
      };
    });

    const invitations: Array<{
      candidateId: string;
      candidateName: string;
      interviewId: string;
      matchScore?: number;
    }> = [];

    // Create interviews and send invitations
    for (const { candidate } of matchedCandidates) {
      try {
        // Create interview with date options
        const interview = await this.interviewService.createInterview(
          {
            candidateId: candidate.id,
            jobId: job.id,
            language: options.language || InterviewLanguage.en,
            type: options.type || InterviewType.live,
            templateId: options.templateId,
            allowSelfScheduling: true,
            deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
          },
          clientId,
        );

        // Update interview with date options
        await this.prisma.interview.update({
          where: { id: interview.id },
          data: {
            dateOptions: dateOptions as any,
            invitationSentAt: new Date(),
          },
        });

        // Send email invitation with 3 date options
        if (candidate.email) {
          // Check if User account exists for this candidate
          let user = await this.prisma.user.findUnique({
            where: { email: candidate.email },
          });

          let generatedPassword: string | undefined;

          // If no User account exists, create one with auto-generated password
          if (!user) {
            generatedPassword = generateSecurePassword();
            const hashedPassword = await bcrypt.hash(generatedPassword, 10);
            
            user = await this.prisma.user.create({
              data: {
                email: candidate.email,
                password: hashedPassword,
                firstName: candidate.firstName,
                lastName: candidate.lastName,
                phone: candidate.phone,
                role: UserRole.interviewee,
                isActive: true,
              },
            });
          }

          // Check if candidate has resume
          const hasResume = !!candidate.resumeUrl;
          
          await this.emailService.sendInterviewInvitationWithDates(
            candidate.email,
            candidate.firstName,
            job.title,
            interview.id,
            dateOptions.map((opt) => opt.date),
            candidate.id, // Pass candidateId for token generation
            candidate.resumeUrl, // Pass resumeUrl to check if resume exists
            generatedPassword, // Pass generated password if user was just created
          );

          // Update candidate status
          await this.prisma.candidate.update({
            where: { id: candidate.id },
            data: { status: CandidateStatus.contacted },
          });

          invitations.push({
            candidateId: candidate.id,
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            interviewId: interview.id,
            matchScore: matchedCandidates.find(
              (m) => m.candidate.id === candidate.id,
            )?.matchScore,
          });
        }
      } catch (error) {
        console.error(
          `Failed to invite candidate ${candidate.id}:`,
          error,
        );
      }
    }

    return {
      message: `Invited ${invitations.length} candidates`,
      invited: invitations.length,
      invitations,
    };
  }
}
