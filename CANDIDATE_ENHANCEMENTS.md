# Candidate Enrollment Enhancements

## Overview
This document describes all the enhancements made to the candidate enrollment system, including validation, search, resume parsing, and webhook integration.

## ✅ Implemented Features

### 1. **Email/Phone Validation & Normalization**
- **Location**: `backend/src/candidates/utils/validation.utils.ts`
- **Features**:
  - Email normalization (lowercase, trim)
  - Email format validation
  - Phone number normalization to international format (+971 for UAE)
  - Skills array normalization and deduplication
  - Profile completeness score calculation (0-100)
  - String similarity calculation for duplicate detection

### 2. **Advanced Search & Filtering**
- **Location**: `backend/src/candidates/dto/candidate-query.dto.ts`
- **Features**:
  - Text search across name, email, and skills
  - Status filtering
  - Job ID filtering
  - Skills array filtering
  - Experience years range filtering (min/max)
  - Location filtering
  - Source platform filtering
  - Date range filtering (createdAt)
  - Boolean filters (hasResume, hasInterview)
  - Pagination support

**API Endpoint**: `GET /candidates?search=john&status=contacted&skills=JavaScript&minExperienceYears=3`

### 3. **Resume Parsing & Auto-Enrichment**
- **Location**: `backend/src/candidates/services/resume-parser.service.ts`
- **Features**:
  - PDF text extraction using `pdf-parse`
  - DOCX text extraction using `mammoth`
  - TXT file support
  - AI-powered parsing using Gemini AI
  - Extracts:
    - Personal info (name, email, phone, location)
    - Skills array
    - Experience years (calculated from work history)
    - Education history
    - Work history
    - Professional summary
    - Certifications
    - Languages
  - Fallback to basic parsing if AI unavailable

**API Endpoint**: `POST /candidates/:id/resume` (multipart/form-data)

### 4. **Duplicate Detection**
- **Location**: `backend/src/candidates/candidates.service.ts` → `findDuplicates()`
- **Features**:
  - Exact email match detection
  - Fuzzy email matching (similarity > 80%)
  - Returns list of potential duplicates

**API Endpoint**: `GET /candidates/:id/duplicates`

### 5. **Webhook Enrollment**
- **Location**: `backend/src/candidates/dto/webhook-candidate.dto.ts`
- **Features**:
  - Secure webhook endpoint with secret verification
  - Accepts candidate data from third-party forms
  - Supports base64-encoded resume files
  - Auto-creates or updates candidates
  - Automatic resume parsing if file provided

**API Endpoint**: `POST /candidates/webhook/enroll`
**Headers**: `x-webhook-secret: YOUR_SECRET`

### 6. **Enhanced Candidate Creation**
- **Location**: `backend/src/candidates/candidates.service.ts` → `createCandidate()`
- **Features**:
  - Automatic email normalization
  - Phone number normalization
  - Skills normalization
  - Duplicate email detection
  - Email format validation

### 7. **Profile Completeness Score**
- **Location**: `backend/src/candidates/candidates.service.ts` → `getProfileCompleteness()`
- **Features**:
  - Calculates completeness score (0-100)
  - Based on: name, email, phone, location, resume, skills, experience, profileData

**API Endpoint**: `GET /candidates/:id/completeness`

## 📁 New Files Created

1. `backend/src/candidates/utils/validation.utils.ts` - Validation utilities
2. `backend/src/candidates/dto/candidate-query.dto.ts` - Advanced search DTO
3. `backend/src/candidates/dto/webhook-candidate.dto.ts` - Webhook DTO
4. `backend/src/candidates/services/resume-parser.service.ts` - Resume parser service

## 🔧 Modified Files

1. `backend/src/candidates/candidates.service.ts` - Enhanced with all new features
2. `backend/src/candidates/candidates.controller.ts` - Added new endpoints
3. `backend/src/candidates/candidates.module.ts` - Added new dependencies
4. `backend/src/candidates/dto/create-candidate.dto.ts` - Added email/phone validation
5. `backend/src/storage/cloudflare-r2.service.ts` - Added resume upload method
6. `backend/package.json` - Added pdf-parse and mammoth dependencies

## 📦 Required Dependencies

Install these packages:
```bash
npm install pdf-parse mammoth @types/pdf-parse --save
```

## 🔐 Environment Variables

Add to `.env`:
```env
WEBHOOK_SECRET=your-secret-key-here
GEMINI_API_KEY=your-gemini-api-key  # Optional, for AI resume parsing
```

## 📡 API Endpoints

### 1. Advanced Search
```
GET /candidates?search=john&status=contacted&skills=JavaScript&minExperienceYears=3&page=1&limit=10
```

### 2. Upload Resume
```
POST /candidates/:id/resume
Content-Type: multipart/form-data
Body: { resume: File }
```

### 3. Webhook Enrollment
```
POST /candidates/webhook/enroll
Headers: { x-webhook-secret: YOUR_SECRET }
Body: {
  email: string,
  firstName?: string,
  lastName?: string,
  phone?: string,
  jobId?: string,
  resumeUrl?: string,
  resumeFile?: string (base64),
  sourcePlatform?: string,
  skills?: string[],
  experienceYears?: number,
  location?: string
}
```

### 4. Find Duplicates
```
GET /candidates/:id/duplicates
```

### 5. Get Profile Completeness
```
GET /candidates/:id/completeness
```

## 🎯 Usage Examples

### Example 1: Create Candidate with Validation
```typescript
POST /candidates
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "JOHN.DOE@EXAMPLE.COM",  // Will be normalized to lowercase
  "phone": "0501234567",  // Will be normalized to +971501234567
  "jobId": "uuid",
  "skills": ["javascript", "JavaScript", "JS"]  // Will be deduplicated and normalized
}
```

### Example 2: Upload and Parse Resume
```typescript
POST /candidates/:id/resume
FormData: { resume: File (PDF/DOCX) }

// Response includes auto-extracted:
// - Skills
// - Experience years
// - Education
// - Work history
// - Contact info
```

### Example 3: Webhook Enrollment
```typescript
POST /candidates/webhook/enroll
Headers: { x-webhook-secret: "secret123" }
{
  "email": "candidate@example.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "jobId": "uuid",
  "resumeFile": "base64-encoded-pdf",
  "sourcePlatform": "Career Site"
}
```

## 🔄 Data Flow

### Resume Upload Flow:
1. File uploaded → Stored in Cloudflare R2
2. Text extracted from PDF/DOCX
3. AI parses text → Extracts structured data
4. Candidate updated with parsed data
5. Skills merged with existing skills
6. Profile completeness recalculated

### Webhook Enrollment Flow:
1. Webhook receives data → Validates secret
2. Checks for existing candidate (by email)
3. Creates or updates candidate
4. If resume file provided → Parses and enriches
5. Returns created/updated candidate

## 🚀 Next Steps

To use these enhancements:

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Set Environment Variables**:
   Add `WEBHOOK_SECRET` to your `.env` file

3. **Test Resume Upload**:
   ```bash
   curl -X POST http://localhost:3000/candidates/:id/resume \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "resume=@resume.pdf"
   ```

4. **Test Webhook**:
   ```bash
   curl -X POST http://localhost:3000/candidates/webhook/enroll \
     -H "x-webhook-secret: YOUR_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","jobId":"uuid"}'
   ```

## 📊 Benefits

1. **Better Data Quality**: Normalization ensures consistent data format
2. **Faster Enrollment**: Resume parsing automates data entry
3. **Duplicate Prevention**: Detects and prevents duplicate candidates
4. **Advanced Search**: Find candidates quickly with powerful filters
5. **Third-Party Integration**: Webhook enables easy integration with external forms
6. **Profile Completeness**: Track and improve candidate data quality

## ⚠️ Notes

- Resume parsing requires Gemini API key for AI extraction (falls back to basic parsing if unavailable)
- Webhook endpoint is public (no JWT required) but protected by secret
- Phone normalization defaults to UAE (+971) - adjust in `validation.utils.ts` if needed
- Resume file size limit: 10MB
- Supported resume formats: PDF, DOCX, DOC, TXT
