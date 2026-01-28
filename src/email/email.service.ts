import { Injectable } from '@nestjs/common';
import {
  generateICalFile,
  generateAddToCalendarLinks,
  CalendarEvent,
} from './calendar-helper';

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

  async sendInterviewInvitationWithDates(
    to: string,
    candidateName: string,
    jobTitle: string,
    interviewId: string,
    dateOptions: string[],
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

    const msg = {
      to,
      from: fromEmail,
      subject: `Interview Invitation - ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4F46E5;">Interview Invitation</h2>
          <p>Dear ${candidateName},</p>
          <p>We are pleased to invite you for an AI-powered interview for the position of <strong>${jobTitle}</strong>.</p>
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
}
