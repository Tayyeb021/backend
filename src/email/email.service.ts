import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly sendgrid: any;

  constructor() {
    // Use require for SendGrid to ensure compatibility with v8
    this.sendgrid = require('@sendgrid/mail');
    const apiKey = process.env.SENDGRID_API_KEY || '';
    if (apiKey) {
      this.sendgrid.setApiKey(apiKey);
    }
  }

  async sendInterviewInvitation(
    to: string,
    candidateName: string,
    jobTitle: string,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@falconrecruiter.com',
      subject: `Interview Invitation - ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Interview Invitation</h2>
          <p>Dear ${candidateName},</p>
          <p>We are pleased to invite you for an interview for the position of <strong>${jobTitle}</strong>.</p>
          <p>You can schedule your interview at your convenience using the link below:</p>
          <p>
            <a href="${frontendUrl}/interview/schedule" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Schedule Interview
            </a>
          </p>
          <p>Best regards,<br>Falcon AI Recruiter Team</p>
        </div>
      `,
    };

    try {
      await this.sendgrid.send(msg);
    } catch (error: any) {
      console.error('Failed to send email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}
