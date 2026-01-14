import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Candidate } from './candidate.entity';
import { Job } from './job.entity';

export enum InterviewStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  MISSED = 'missed',
}

export enum InterviewLanguage {
  ENGLISH = 'en',
  ARABIC = 'ar',
  HINDI = 'hi',
  URDU = 'ur',
  BENGALI = 'bn',
}

@Entity('interviews')
export class Interview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  candidateId: string;

  @ManyToOne(() => Candidate, (candidate) => candidate.interviews)
  @JoinColumn({ name: 'candidateId' })
  candidate: Candidate;

  @Column('uuid')
  jobId: string;

  @ManyToOne(() => Job)
  @JoinColumn({ name: 'jobId' })
  job: Job;

  @Column('uuid')
  recruiterId: string;

  @ManyToOne(() => User, (user) => user.interviews)
  @JoinColumn({ name: 'recruiterId' })
  recruiter: User;

  @Column({
    type: 'enum',
    enum: InterviewStatus,
    default: InterviewStatus.SCHEDULED,
  })
  status: InterviewStatus;

  @Column({
    type: 'enum',
    enum: InterviewLanguage,
    default: InterviewLanguage.ENGLISH,
  })
  language: InterviewLanguage;

  @Column({ nullable: true })
  scheduledAt: Date;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  dailyRoomId: string;

  @Column({ nullable: true })
  videoUrl: string;

  @Column('text', { nullable: true })
  transcript: string;

  @Column('jsonb', { nullable: true })
  transcriptWithTimestamps: Array<{
    timestamp: number;
    speaker: string;
    text: string;
  }>;

  @Column('jsonb', { nullable: true })
  scores: {
    technical: number;
    communication: number;
    culturalFit: number;
    overall: number;
  };

  @Column('text', { nullable: true })
  aiSummary: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
