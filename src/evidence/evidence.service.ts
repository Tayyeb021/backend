import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EvidenceService {
  constructor(private prisma: PrismaService) {}

  /**
   * Attach evidence to a score
   */
  async attachEvidence(data: {
    scoreId: string;
    scoreType: string;
    scoreValue: number;
    evidenceType: string;
    evidenceSource: string;
    evidenceId: string;
    transcriptSnippet?: string;
    timestampStart?: number;
    timestampEnd?: number;
    confidence?: number;
  }) {
    // Validate evidence source exists
    if (data.evidenceSource === 'interview') {
      const interview = await this.prisma.interview.findUnique({
        where: { id: data.evidenceId },
      });
      if (!interview) {
        throw new BadRequestException('Interview not found');
      }
    } else if (data.evidenceSource === 'coding_assessment') {
      const assessment = await this.prisma.codingAssessment.findUnique({
        where: { id: data.evidenceId },
      });
      if (!assessment) {
        throw new BadRequestException('Assessment not found');
      }
    }

    return this.prisma.scoreEvidence.create({
      data: {
        scoreId: data.scoreId,
        scoreType: data.scoreType,
        scoreValue: data.scoreValue,
        evidenceType: data.evidenceType,
        evidenceSource: data.evidenceSource,
        evidenceId: data.evidenceId,
        transcriptSnippet: data.transcriptSnippet,
        timestampStart: data.timestampStart,
        timestampEnd: data.timestampEnd,
        confidence: data.confidence || 1.0,
      },
    });
  }

  /**
   * Get evidence for a score
   */
  async getEvidenceForScore(scoreId: string) {
    return this.prisma.scoreEvidence.findMany({
      where: { scoreId },
      orderBy: { confidence: 'desc' },
      include: {
        interview: {
          select: { id: true, candidateId: true, jobId: true },
        },
        assessment: {
          select: { id: true, candidateId: true, jobId: true },
        },
      },
    });
  }

  /**
   * Validate score has evidence
   */
  async validateScoreHasEvidence(scoreId: string): Promise<boolean> {
    const evidence = await this.prisma.scoreEvidence.findFirst({
      where: { scoreId },
    });
    return !!evidence;
  }

  /**
   * Get all evidence for an interview
   */
  async getEvidenceForInterview(interviewId: string) {
    return this.prisma.scoreEvidence.findMany({
      where: {
        evidenceId: interviewId,
        evidenceSource: 'interview',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all evidence for an assessment
   */
  async getEvidenceForAssessment(assessmentId: string) {
    return this.prisma.scoreEvidence.findMany({
      where: {
        evidenceId: assessmentId,
        evidenceSource: 'coding_assessment',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Extract transcript snippet with context
   */
  async extractTranscriptSnippet(
    transcript: string,
    timestampStart: number,
    timestampEnd: number,
    contextSeconds: number = 5,
  ): Promise<string> {
    // Parse transcript with timestamps and extract relevant snippet
    const lines = transcript.split('\n');
    const relevantLines: string[] = [];
    let inRange = false;

    for (const line of lines) {
      // Extract timestamp from line if present (format: [MM:SS] or [HH:MM:SS])
      const timestampMatch = line.match(/\[(\d+):(\d+)(?::(\d+))?\]/);
      if (timestampMatch) {
        const hours = timestampMatch[3] ? parseInt(timestampMatch[1]) : 0;
        const minutes = timestampMatch[3] ? parseInt(timestampMatch[2]) : parseInt(timestampMatch[1]);
        const seconds = timestampMatch[3] ? parseInt(timestampMatch[3]) : parseInt(timestampMatch[2]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;

        if (totalSeconds >= timestampStart - contextSeconds) {
          inRange = true;
        }
        if (totalSeconds > timestampEnd + contextSeconds) {
          break;
        }
      }

      if (inRange) {
        relevantLines.push(line);
      }
    }

    return relevantLines.join('\n');
  }
}
