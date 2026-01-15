import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Candidate, CandidateStatus } from '@prisma/client';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(private prisma: PrismaService) {}

  async createCandidate(
    createCandidateDto: CreateCandidateDto,
  ): Promise<Candidate> {
    return await this.prisma.candidate.create({
      data: createCandidateDto,
    });
  }

  async getCandidatesByJob(jobId: string): Promise<Candidate[]> {
    return await this.prisma.candidate.findMany({
      where: { jobId },
      include: { interviews: true, job: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCandidate(id: string): Promise<Candidate> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: { interviews: true, job: true },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    return candidate;
  }

  async updateCandidateStatus(
    id: string,
    status: CandidateStatus,
  ): Promise<Candidate> {
    try {
      return await this.prisma.candidate.update({
        where: { id },
        data: { status },
      });
    } catch (error) {
      throw new NotFoundException('Candidate not found');
    }
  }

  async updateCandidate(
    id: string,
    updateCandidateDto: UpdateCandidateDto,
  ): Promise<Candidate> {
    try {
      return await this.prisma.candidate.update({
        where: { id },
        data: updateCandidateDto,
      });
    } catch (error) {
      throw new NotFoundException('Candidate not found');
    }
  }
}
