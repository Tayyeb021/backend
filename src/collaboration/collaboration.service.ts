import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { AddCommentDto } from './dto/add-comment.dto';

@Injectable()
export class CollaborationService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationsGateway: NotificationsGateway,
  ) {}

  async addComment(
    candidateId: string,
    userId: string,
    dto: AddCommentDto,
  ): Promise<any> {
    // Verify candidate exists
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { job: true },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Create comment
    const comment = await this.prisma.candidateComment.create({
      data: {
        candidateId,
        userId,
        content: dto.content,
        mentionedUserIds: dto.mentionedUserIds || [],
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Create activity log
    await this.prisma.activityLog.create({
      data: {
        candidateId,
        userId,
        action: 'comment_added',
        details: {
          commentId: comment.id,
          content: dto.content.substring(0, 100), // First 100 chars
        },
      },
    });

    // Notify mentioned users
    if (dto.mentionedUserIds && dto.mentionedUserIds.length > 0) {
      const mentionedUsers = await this.prisma.user.findMany({
        where: {
          id: { in: dto.mentionedUserIds },
        },
      });

      for (const user of mentionedUsers) {
        // Send real-time notification
        this.notificationsGateway.notifyUser(user.id, {
          title: 'You were mentioned in a comment',
          description: `${comment.user.firstName} ${comment.user.lastName} mentioned you in a comment about ${candidate.firstName} ${candidate.lastName}`,
          type: 'info',
          href: `/dashboard/candidates/${candidateId}`,
        });

        // Send email notification
        try {
          await this.emailService.sendEmail(
            user.email,
            `You were mentioned in a comment - ${candidate.firstName} ${candidate.lastName}`,
            `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>You were mentioned in a comment</h2>
                <p>${comment.user.firstName} ${comment.user.lastName} mentioned you in a comment about candidate <strong>${candidate.firstName} ${candidate.lastName}</strong> for the position of <strong>${candidate.job.title}</strong>.</p>
                <p><strong>Comment:</strong></p>
                <p style="background-color: #f3f4f6; padding: 15px; border-radius: 8px;">${dto.content}</p>
                <p style="margin-top: 20px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/candidates/${candidateId}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                    View Candidate
                  </a>
                </p>
              </div>
            `,
          );
        } catch (error) {
          console.error(`Failed to send email to ${user.email}:`, error);
          // Don't throw - email failure shouldn't break the comment creation
        }
      }
    }

    return comment;
  }

  async getComments(candidateId: string): Promise<any[]> {
    return this.prisma.candidateComment.findMany({
      where: { candidateId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async shareCandidate(
    candidateId: string,
    sharedByUserId: string,
    sharedWithUserId: string,
    notes?: string,
  ): Promise<any> {
    // Verify candidate exists
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { job: true },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Verify users exist
    const [sharedBy, sharedWith] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: sharedByUserId } }),
      this.prisma.user.findUnique({ where: { id: sharedWithUserId } }),
    ]);

    if (!sharedBy || !sharedWith) {
      throw new NotFoundException('User not found');
    }

    // Create share record
    const share = await this.prisma.candidateShare.create({
      data: {
        candidateId,
        sharedByUserId,
        sharedWithUserId,
        notes,
      },
      include: {
        sharedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sharedWith: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Create activity log
    await this.prisma.activityLog.create({
      data: {
        candidateId,
        userId: sharedByUserId,
        action: 'candidate_shared',
        details: {
          shareId: share.id,
          sharedWithUserId,
          sharedWithEmail: sharedWith.email,
        },
      },
    });

    // Notify the user the candidate was shared with
    this.notificationsGateway.notifyUser(sharedWithUserId, {
      title: 'Candidate shared with you',
      description: `${sharedBy.firstName} ${sharedBy.lastName} shared candidate ${candidate.firstName} ${candidate.lastName} with you`,
      type: 'info',
      href: `/dashboard/candidates/${candidateId}`,
    });

    // Send email notification
    try {
      await this.emailService.sendEmail(
        sharedWith.email,
        `Candidate shared with you - ${candidate.firstName} ${candidate.lastName}`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Candidate shared with you</h2>
            <p>${sharedBy.firstName} ${sharedBy.lastName} shared a candidate with you:</p>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Candidate:</strong> ${candidate.firstName} ${candidate.lastName}</p>
              <p><strong>Email:</strong> ${candidate.email}</p>
              <p><strong>Position:</strong> ${candidate.job.title}</p>
              ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
            </div>
            <p style="margin-top: 20px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/candidates/${candidateId}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                View Candidate
              </a>
            </p>
          </div>
        `,
      );
    } catch (error) {
      console.error(`Failed to send email to ${sharedWith.email}:`, error);
    }

    return share;
  }

  async getShares(candidateId: string): Promise<any[]> {
    return this.prisma.candidateShare.findMany({
      where: { candidateId },
      include: {
        sharedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sharedWith: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { sharedAt: 'desc' },
    });
  }

  async getActivityLogs(candidateId?: string, userId?: string): Promise<any[]> {
    const where: any = {};
    if (candidateId) where.candidateId = candidateId;
    if (userId) where.userId = userId;

    return this.prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        candidate: candidateId
          ? {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            }
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to last 100 activities
    });
  }

  async searchUsers(query: string): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      take: 20,
    });
  }
}
