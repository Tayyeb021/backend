import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidate, CandidateStatus } from '../entities/candidate.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(Candidate)
    private candidateRepository: Repository<Candidate>,
  ) {}

  async createCandidate(createCandidateDto: CreateCandidateDto): Promise<Candidate> {
    const candidate = this.candidateRepository.create(createCandidateDto);
    return await this.candidateRepository.save(candidate);
  }

  async getCandidatesByJob(jobId: string): Promise<Candidate[]> {
    return await this.candidateRepository.find({
      where: { jobId },
      relations: ['interviews', 'job'],
      order: { createdAt: 'DESC' },
    });
  }

  async getCandidate(id: string): Promise<Candidate> {
    const candidate = await this.candidateRepository.findOne({
      where: { id },
      relations: ['interviews', 'job'],
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
    const candidate = await this.candidateRepository.findOne({ where: { id } });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    candidate.status = status;
    return await this.candidateRepository.save(candidate);
  }

  async updateCandidate(id: string, updateCandidateDto: UpdateCandidateDto): Promise<Candidate> {
    const candidate = await this.candidateRepository.findOne({ where: { id } });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    Object.assign(candidate, updateCandidateDto);
    return await this.candidateRepository.save(candidate);
  }
}
