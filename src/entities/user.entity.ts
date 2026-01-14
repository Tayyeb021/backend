import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Job } from './job.entity';
import { Interview } from './interview.entity';

export enum UserRole {
  ADMIN = 'admin',
  RECRUITER = 'recruiter',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.RECRUITER,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Job, (job) => job.recruiter)
  jobs: Job[];

  @OneToMany(() => Interview, (interview) => interview.recruiter)
  interviews: Interview[];
}
