# Resume Upload Workflow for Third-Party Candidates

## Overview
When candidates are sourced from third-party websites (LinkedIn, Lixa, etc.) or when a recruiter creates a job, the system automatically checks if candidates have resumes. If not, the email invitation includes a prominent resume upload option.

## Complete Workflow

### 1. Job Creation → Auto-Invite Process

```
Recruiter Creates Job
    ↓
Job Status: "published"
    ↓
Auto-Invite Process Starts (Background)
    ↓
System Matches Top 10 Candidates
    ↓
For Each Candidate:
    ├─→ Check: Does candidate have resumeUrl?
    │   ├─→ YES: Send normal email (no upload section)
    │   └─→ NO: Generate resume upload token
    │       ↓
    │       Include "Upload Resume" section in email
    ↓
Email Sent to Candidate
```

### 2. Email Content (Candidate WITHOUT Resume)

```
┌─────────────────────────────────────────────┐
│ Interview Invitation                        │
├─────────────────────────────────────────────┤
│ Dear John Doe,                              │
│                                             │
│ We are pleased to invite you for an        │
│ AI-powered interview for the position of    │
│ Software Engineer.                          │
│                                             │
│ ┌───────────────────────────────────────┐ │
│ │ 📄 Complete Your Profile               │ │
│ │                                       │ │
│ │ We noticed you haven't uploaded your   │ │
│ │ resume yet. Help us get to know you   │ │
│ │ better by uploading your resume.      │ │
│ │                                       │ │
│ │ [📤 Upload Resume Now]                │ │
│ │                                       │ │
│ │ 💡 Tip: You can upload now or after   │ │
│ │    scheduling your interview.        │ │
│ └───────────────────────────────────────┘ │
│                                             │
│ Available Time Slots:                        │
│ • Option 1: Monday, Jan 15, 10:00 AM       │
│ • Option 2: Wednesday, Jan 17, 10:00 AM    │
│ • Option 3: Friday, Jan 19, 10:00 AM       │
│                                             │
│ [Select Your Preferred Time]               │
│                                             │
│ Add to Calendar: [Google] [Outlook] [Yahoo]│
└─────────────────────────────────────────────┘
```

### 3. Candidate Clicks "Upload Resume" Link

```
Candidate Clicks Link
    ↓
URL: /candidate/resume-upload/{token}
    ↓
Public Page Opens (No Login Required)
    ↓
Shows:
    - Candidate Name
    - Job Title
    - Upload Form
    ↓
Candidate Uploads Resume (PDF/DOCX/TXT)
    ↓
System Processes:
    1. Validates file (size, type)
    2. Uploads to Cloudflare R2
    3. Extracts text from resume
    4. Parses with AI (Gemini)
    5. Extracts: skills, experience, education, etc.
    6. Updates candidate profile
    ↓
Success Message + Auto-Redirect
    ↓
Redirects to: /interview/schedule/{interviewId}
```

### 4. Resume Upload Page Flow

```
GET /candidates/public/resume-upload/:token
    ↓
Verify Token (checks expiry)
    ↓
Return Candidate Info:
    - candidateId
    - candidateName
    - jobTitle
    - interviewId
    - hasResume (false)
    ↓
Frontend Displays Upload Form
    ↓
POST /candidates/public/upload-resume/:token
    ↓
Upload & Parse Resume
    ↓
Return:
    {
      success: true,
      message: "Resume uploaded successfully",
      candidateId: "...",
      interviewId: "...",
      redirectUrl: "/interview/schedule/{interviewId}"
    }
    ↓
Frontend Redirects to Interview Scheduling
```

## Implementation Details

### Token Generation

```typescript
// Token is generated when email is sent (if no resume)
const token = generateResumeUploadToken(candidateId, interviewId);

// Token format: HMAC-SHA256(candidateId:interviewId:timestamp, secret)
// Stored in: candidate.profileData.resumeUploadToken
// Expires: 24 hours
```

### Security Features

1. **Token Expiry**: 24 hours from generation
2. **HMAC Signing**: Uses secret key for security
3. **One-Time Use**: Token can be invalidated after use
4. **No Authentication Required**: Public endpoint for candidates
5. **File Validation**: Size (10MB) and type (PDF/DOCX/TXT) checks

### Email Service Logic

```typescript
// In sendInterviewInvitationWithDates():
if (candidateId && !candidateResumeUrl) {
  // Generate token
  const token = await candidatesService.generateResumeUploadToken(
    candidateId,
    interviewId,
  );
  
  // Include in email
  resumeUploadUrl = `${frontendUrl}/candidate/resume-upload/${token}`;
}

// Email HTML includes resume upload section if URL exists
```

## API Endpoints

### 1. Get Resume Upload Page Info
```
GET /candidates/public/resume-upload/:token
Response: {
  candidateId: string,
  candidateName: string,
  jobTitle: string,
  interviewId: string,
  hasResume: boolean,
  email: string
}
```

### 2. Upload Resume (Public)
```
POST /candidates/public/upload-resume/:token
Content-Type: multipart/form-data
Body: { resume: File }

Response: {
  success: true,
  message: "Resume uploaded successfully",
  candidateId: string,
  interviewId: string,
  redirectUrl: string
}
```

## When Resume Upload Link is Included

The resume upload section is automatically included in emails when:

1. ✅ **Auto-Invite Process**: Job created → Candidates matched → Email sent
   - If candidate has no `resumeUrl` → Upload link included

2. ✅ **Manual Invite**: Recruiter invites candidate by email
   - If candidate has no `resumeUrl` → Upload link included

3. ✅ **Next Round Interview**: Candidate advanced to next round
   - If candidate has no `resumeUrl` → Upload link included

4. ❌ **Candidate Has Resume**: If `resumeUrl` exists → No upload section shown

## Benefits

1. **Automatic**: No manual configuration needed
2. **Smart**: Only shows when needed (no resume)
3. **Non-Intrusive**: Candidate can skip and schedule directly
4. **Better Profiles**: Encourages resume upload before interview
5. **Seamless**: Auto-redirects to scheduling after upload

## Frontend Implementation

### Resume Upload Page Example

```typescript
// frontend/app/candidate/resume-upload/[token]/page.tsx

'use client';

export default function ResumeUploadPage({ params }: { params: { token: string } }) {
  const [candidate, setCandidate] = useState(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    // Fetch candidate info
    fetch(`/api/candidates/public/resume-upload/${params.token}`)
      .then(res => res.json())
      .then(data => setCandidate(data));
  }, [params.token]);

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('resume', file);
    
    const res = await fetch(`/api/candidates/public/upload-resume/${params.token}`, {
      method: 'POST',
      body: formData,
    });
    
    const data = await res.json();
    if (data.success && data.redirectUrl) {
      window.location.href = data.redirectUrl;
    }
  };

  return (
    <div>
      <h1>Upload Your Resume</h1>
      {candidate && (
        <p>Hello {candidate.candidateName}!</p>
      )}
      <input type="file" onChange={(e) => setFile(e.target.files?.[0])} />
      <button onClick={handleUpload}>Upload</button>
    </div>
  );
}
```

## Environment Variables

Add to `.env`:
```env
RESUME_UPLOAD_SECRET=your-secret-key-here  # Optional, defaults to JWT_SECRET
FRONTEND_URL=http://localhost:3000  # For generating upload URLs
```

## Testing

### Test Resume Upload Flow:

1. **Create a candidate without resume**:
   ```bash
   POST /candidates
   {
     "email": "test@example.com",
     "firstName": "Test",
     "lastName": "User",
     "jobId": "job-uuid"
     # No resumeUrl
   }
   ```

2. **Invite candidate**:
   ```bash
   POST /jobs/{jobId}/invite-by-email
   {
     "email": "test@example.com"
   }
   ```

3. **Check email**: Should include resume upload section

4. **Get upload token**:
   ```bash
   GET /candidates/public/resume-upload/{token}
   ```

5. **Upload resume**:
   ```bash
   POST /candidates/public/upload-resume/{token}
   FormData: { resume: File }
   ```

## Summary

✅ **Automatic**: Checks resume on every email send
✅ **Smart**: Only includes upload link if no resume
✅ **Secure**: Token-based, expires in 24 hours
✅ **User-Friendly**: Clear call-to-action in email
✅ **Seamless**: Auto-redirects after upload

The system now automatically encourages candidates without resumes to upload them, improving profile completeness and interview quality!
