import { Injectable, Inject, forwardRef } from '@nestjs/common';
import {
  generateICalFile,
  generateAddToCalendarLinks,
  CalendarEvent,
} from './calendar-helper';
import { CandidatesService } from '../candidates/candidates.service';

@Injectable()
export class EmailService {
  private readonly sendgrid: any;
  private candidatesService: CandidatesService | null = null;

  constructor(
    @Inject(forwardRef(() => CandidatesService))
    candidatesService: CandidatesService,
  ) {
    // Use require for SendGrid to ensure compatibility with v8
    this.sendgrid = require('@sendgrid/mail');
    const apiKey = process.env.SENDGRID_API_KEY || '';
    if (apiKey) {
      this.sendgrid.setApiKey(apiKey);
    }
    this.candidatesService = candidatesService;
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

  async sendInterviewInvitationWithDates(
    to: string,
    candidateName: string,
    jobTitle: string,
    interviewId: string,
    dateOptions: string[],
    candidateId?: string,
    candidateResumeUrl?: string | null,
    generatedPassword?: string,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const scheduleUrl = `${frontendUrl}/interview/schedule/${interviewId}`;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@falconrecruiter.com';
    const organizerName = process.env.ORGANIZER_NAME || 'Falcon AI Recruiter Team';

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const dateOptionsHtml = dateOptions
      .map(
        (date, index) => `
      <div style="margin: 10px 0; padding: 15px; background-color: #f3f4f6; border-radius: 8px;">
        <strong>Option ${index + 1}:</strong> ${formatDate(date)}
      </div>
    `,
      )
      .join('');

    // Generate calendar links for the first date option (tentative)
    const firstDate = new Date(dateOptions[0]);
    const endDate = new Date(firstDate.getTime() + 60 * 60 * 1000); // 1 hour duration

    const calendarLinks = generateAddToCalendarLinks({
      title: `Interview - ${jobTitle}`,
      description: `AI-powered interview for ${jobTitle}. Please select your preferred time slot.`,
      startDate: firstDate,
      endDate: endDate,
      location: 'Online (AI Interview)',
      organizer: {
        name: organizerName,
        email: fromEmail,
      },
      attendee: {
        name: candidateName,
        email: to,
      },
      url: scheduleUrl,
    });

    // Generate resume upload token if candidate has no resume
    let resumeUploadUrl: string | null = null;
    if (candidateId && !candidateResumeUrl && this.candidatesService) {
      try {
        const token = await this.candidatesService.generateResumeUploadToken(
          candidateId,
          interviewId,
        );
        resumeUploadUrl = `${frontendUrl}/candidate/resume-upload/${token}`;
      } catch (error) {
        console.error('Failed to generate resume upload token:', error);
        // Continue without resume upload link if token generation fails
      }
    }

    const msg = {
      to,
      from: fromEmail,
      subject: `Interview Invitation - ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4F46E5;">Interview Invitation</h2>
          <p>Dear ${candidateName},</p>
          <p>We are pleased to invite you for an AI-powered interview for the position of <strong>${jobTitle}</strong>.</p>
          
          ${generatedPassword ? `
          <!-- Login Credentials Section - Only shown if user account was just created -->
          <div style="margin: 25px 0; padding: 20px; background-color: #e0f2fe; border-left: 4px solid #0ea5e9; border-radius: 4px;">
            <p style="margin: 0 0 15px 0; font-weight: bold; color: #0c4a6e; font-size: 16px;">
              🔐 Your Login Credentials
            </p>
            <p style="margin: 0 0 10px 0; color: #075985; font-size: 14px; line-height: 1.6;">
              We've created an account for you. Use these credentials to log in to your candidate dashboard:
            </p>
            <div style="background-color: #f0f9ff; padding: 12px; border-radius: 4px; margin: 10px 0; border: 1px solid #bae6fd;">
              <p style="margin: 5px 0; font-family: monospace; color: #0c4a6e; font-size: 14px;">
                <strong>Email:</strong> ${to}<br>
                <strong>Password:</strong> <span style="background-color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: bold;">${generatedPassword}</span>
              </p>
            </div>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #075985;">
              ⚠️ <strong>Please save this password securely.</strong> You can change it after logging in.
            </p>
            <p style="margin: 15px 0 0 0;">
              <a href="${frontendUrl}/login" style="background-color: #0ea5e9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 14px;">
                🔑 Login Now
              </a>
            </p>
          </div>
          ` : ''}
          
          ${resumeUploadUrl ? `
          <!-- Resume Upload Section - Only shown if candidate has no resume -->
          <div style="margin: 25px 0; padding: 20px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
            <p style="margin: 0 0 15px 0; font-weight: bold; color: #92400e; font-size: 16px;">
              📄 Complete Your Profile - Upload Your Resume
            </p>
            <p style="margin: 0 0 15px 0; color: #78350f; font-size: 14px; line-height: 1.6;">
              We noticed you haven't uploaded your resume yet. Help us get to know you better by uploading your resume. This will help us prepare a more personalized interview experience for you.
            </p>
            <p style="margin: 0 0 15px 0;">
              <a href="${resumeUploadUrl}" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                📤 Upload Resume Now
              </a>
            </p>
            <p style="margin: 0; font-size: 12px; color: #92400e;">
              💡 Tip: You can upload your resume now or after scheduling your interview. Both options are available!
            </p>
          </div>
          ` : ''}
          
          <p>Please select one of the following available time slots:</p>
          ${dateOptionsHtml}
          <p style="margin-top: 30px;">
            <a href="${scheduleUrl}" style="background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Select Your Preferred Time
            </a>
          </p>
          <div style="margin-top: 25px; padding: 15px; background-color: #f0f9ff; border-left: 4px solid #4F46E5; border-radius: 4px;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e40af;">Add to Calendar:</p>
            <p style="margin: 5px 0;">
              <a href="${calendarLinks.google}" style="color: #4F46E5; text-decoration: none; margin-right: 15px;">📅 Google Calendar</a>
              <a href="${calendarLinks.outlook}" style="color: #4F46E5; text-decoration: none; margin-right: 15px;">📅 Outlook</a>
              <a href="${calendarLinks.yahoo}" style="color: #4F46E5; text-decoration: none;">📅 Yahoo Calendar</a>
            </p>
            <p style="margin-top: 10px; font-size: 12px; color: #6b7280;">
              Note: This is a tentative calendar entry. Please confirm your preferred time slot using the button above.
            </p>
          </div>
          <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
            The interview will be conducted by our AI system. You'll receive further instructions once you confirm your time slot.
          </p>
          <p style="margin-top: 30px;">Best regards,<br><strong>Falcon AI Recruiter Team</strong></p>
        </div>
      `,
      attachments: [
        {
          content: Buffer.from(
            generateICalFile({
              title: `Interview Invitation - ${jobTitle}`,
              description: `AI-powered interview for ${jobTitle}. Please select your preferred time slot at: ${scheduleUrl}`,
              startDate: firstDate,
              endDate: endDate,
              location: 'Online (AI Interview)',
              organizer: {
                name: organizerName,
                email: fromEmail,
              },
              attendee: {
                name: candidateName,
                email: to,
              },
              url: scheduleUrl,
            }),
          ).toString('base64'),
          filename: 'interview-invitation.ics',
          type: 'text/calendar',
          disposition: 'attachment',
        },
      ],
    };

    try {
      await this.sendgrid.send(msg);
    } catch (error: any) {
      console.error('Failed to send email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendInterviewConfirmationWithCalendar(
    to: string,
    candidateName: string,
    jobTitle: string,
    scheduledAt: Date,
    interviewUrl?: string,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@falconrecruiter.com';
    const organizerName = process.env.ORGANIZER_NAME || 'Falcon AI Recruiter Team';

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const endDate = new Date(scheduledAt.getTime() + 60 * 60 * 1000); // 1 hour duration

    const calendarLinks = generateAddToCalendarLinks({
      title: `Interview - ${jobTitle}`,
      description: `Confirmed AI-powered interview for ${jobTitle}.${interviewUrl ? ` Join at: ${interviewUrl}` : ''}`,
      startDate: scheduledAt,
      endDate: endDate,
      location: 'Online (AI Interview)',
      organizer: {
        name: organizerName,
        email: fromEmail,
      },
      attendee: {
        name: candidateName,
        email: to,
      },
      url: interviewUrl || `${frontendUrl}/interview`,
    });

    const msg = {
      to,
      from: fromEmail,
      subject: `Interview Confirmed - ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #10b981;">Interview Confirmed</h2>
          <p>Dear ${candidateName},</p>
          <p>Your interview for the position of <strong>${jobTitle}</strong> has been confirmed.</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px;">
            <p style="margin: 0; font-weight: bold; color: #065f46;">Scheduled Time:</p>
            <p style="margin: 10px 0 0 0; font-size: 18px; color: #047857;">${formatDate(scheduledAt)}</p>
          </div>
          ${interviewUrl ? `
          <p style="margin-top: 25px;">
            <a href="${interviewUrl}" style="background-color: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Join Interview
            </a>
          </p>
          ` : ''}
          <div style="margin-top: 25px; padding: 15px; background-color: #f0f9ff; border-left: 4px solid #4F46E5; border-radius: 4px;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e40af;">Add to Calendar:</p>
            <p style="margin: 5px 0;">
              <a href="${calendarLinks.google}" style="color: #4F46E5; text-decoration: none; margin-right: 15px;">📅 Google Calendar</a>
              <a href="${calendarLinks.outlook}" style="color: #4F46E5; text-decoration: none; margin-right: 15px;">📅 Outlook</a>
              <a href="${calendarLinks.yahoo}" style="color: #4F46E5; text-decoration: none;">📅 Yahoo Calendar</a>
            </p>
          </div>
          <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
            This is an AI-powered interview. Please ensure you have a stable internet connection and a quiet environment.
          </p>
          <p style="margin-top: 30px;">Best regards,<br><strong>Falcon AI Recruiter Team</strong></p>
        </div>
      `,
      attachments: [
        {
          content: Buffer.from(
            generateICalFile({
              title: `Interview - ${jobTitle}`,
              description: `Confirmed AI-powered interview for ${jobTitle}.${interviewUrl ? ` Join at: ${interviewUrl}` : ''}`,
              startDate: scheduledAt,
              endDate: endDate,
              location: 'Online (AI Interview)',
              organizer: {
                name: organizerName,
                email: fromEmail,
              },
              attendee: {
                name: candidateName,
                email: to,
              },
              url: interviewUrl || `${frontendUrl}/interview`,
            }),
          ).toString('base64'),
          filename: 'interview-confirmation.ics',
          type: 'text/calendar',
          disposition: 'attachment',
        },
      ],
    };

    try {
      await this.sendgrid.send(msg);
    } catch (error: any) {
      console.error('Failed to send confirmation email:', error);
      throw new Error(`Failed to send confirmation email: ${error.message}`);
    }
  }

  /**
   * Generic email sending method for automation and other use cases
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string,
    from?: string,
  ): Promise<void> {
    const msg = {
      to,
      from: from || process.env.SENDGRID_FROM_EMAIL || 'noreply@falconrecruiter.com',
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
    };

    try {
      await this.sendgrid.send(msg);
    } catch (error: any) {
      console.error('Failed to send email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendFeedbackEmail(
    to: string,
    candidateName: string,
    content: string,
    jobTitle?: string,
    scores?: {
      technical?: number;
      communication?: number;
      problemSolving?: number;
      culturalFit?: number;
      overall?: number;
    } | null,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@falconrecruiter.com';

    let scoresHtml = '';
    if (scores) {
      scoresHtml = `
        <div style="margin: 20px 0; padding: 15px; background-color: #f9fafb; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #1f2937;">Interview Scores</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${scores.technical !== undefined ? `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Technical:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scores.technical}%</td>
              </tr>
            ` : ''}
            ${scores.communication !== undefined ? `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Communication:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scores.communication}%</td>
              </tr>
            ` : ''}
            ${scores.problemSolving !== undefined ? `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Problem Solving:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scores.problemSolving}%</td>
              </tr>
            ` : ''}
            ${scores.culturalFit !== undefined ? `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Cultural Fit:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scores.culturalFit}%</td>
              </tr>
            ` : ''}
            ${scores.overall !== undefined ? `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Overall Score:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>${scores.overall}%</strong></td>
              </tr>
            ` : ''}
          </table>
        </div>
      `;
    }

    const msg = {
      to,
      from: fromEmail,
      subject: jobTitle ? `Feedback - ${jobTitle}` : 'Interview Feedback',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1f2937; margin-bottom: 20px;">Interview Feedback</h2>
          <p>Dear ${candidateName},</p>
          <div style="margin: 20px 0; padding: 15px; background-color: #ffffff; border-left: 4px solid #4F46E5; border-radius: 4px;">
            ${content.split('\n').map(para => `<p style="margin: 10px 0; line-height: 1.6; color: #374151;">${para || '<br>'}</p>`).join('')}
          </div>
          ${scoresHtml}
          <p style="margin-top: 30px;">You can view this feedback and your application status by logging into your candidate portal.</p>
          <p style="margin-top: 20px;">
            <a href="${frontendUrl}/my-application" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Application
            </a>
          </p>
          <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
            Best regards,<br>
            Falcon AI Recruiter Team
          </p>
        </div>
      `,
    };

    try {
      await this.sendgrid.send(msg);
    } catch (error: any) {
      console.error('Failed to send feedback email:', error);
      throw new Error(`Failed to send feedback email: ${error.message}`);
    }
  }
}
