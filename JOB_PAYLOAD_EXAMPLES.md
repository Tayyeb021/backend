# Job Creation Payload Examples

## API Endpoint
```
POST /jobs
```

## Required Fields
- `title` (string)
- `description` (string)
- `requiredSkills` (string[])
- `experienceLevel` (enum: `one_to_three` | `three_to_five` | `five_plus`)
- `seniorityLevel` (enum: `junior` | `mid` | `senior` | `expert`)
- `jobType` (enum: `full_time` | `part_time` | `contract` | `freelance`)
- `engagementLength` (enum: `short_term` | `long_term`)
- `workMode` (enum: `remote` | `hybrid` | `onsite`)

---

## 1. Minimum Required Fields Payload

```json
{
  "title": "Senior Full Stack Developer",
  "description": "We are looking for an experienced full stack developer to join our team.",
  "requiredSkills": ["JavaScript", "TypeScript", "React", "Node.js", "PostgreSQL"],
  "experienceLevel": "five_plus",
  "seniorityLevel": "senior",
  "jobType": "full_time",
  "engagementLength": "long_term",
  "workMode": "remote"
}
```

---

## 2. Full Payload with All Fields

```json
{
  "title": "Senior Full Stack Developer",
  "description": "We are looking for an experienced full stack developer to join our dynamic team. You will be responsible for building scalable web applications and working with cutting-edge technologies.",
  
  "requiredSkills": [
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "PostgreSQL",
    "AWS",
    "Docker",
    "GraphQL"
  ],
  
  "experienceLevel": "five_plus",
  "seniorityLevel": "senior",
  
  "jobType": "full_time",
  "engagementLength": "long_term",
  "workMode": "remote",
  
  "country": "United States",
  "timezone": "America/New_York",
  
  "minSalary": 120000,
  "maxSalary": 180000,
  "currency": "USD",
  "billingType": "monthly",
  
  "openings": 2,
  "hiringDeadline": "2025-03-31T23:59:59.000Z",
  "priority": "high",
  
  "status": "draft",
  "publishedAt": "2025-01-20T00:00:00.000Z",
  "expiresAt": "2025-06-30T23:59:59.000Z"
}
```

---

## 3. Example Payloads for Different Scenarios

### Contract Job (Short-term)
```json
{
  "title": "Frontend Developer - Contract",
  "description": "3-month contract position for frontend development work.",
  "requiredSkills": ["React", "TypeScript", "CSS", "HTML"],
  "experienceLevel": "three_to_five",
  "seniorityLevel": "mid",
  "jobType": "contract",
  "engagementLength": "short_term",
  "workMode": "hybrid",
  "country": "Canada",
  "timezone": "America/Toronto",
  "minSalary": 80,
  "maxSalary": 100,
  "currency": "CAD",
  "billingType": "hourly",
  "openings": 1,
  "hiringDeadline": "2025-02-15T23:59:59.000Z"
}
```

### Freelance Job
```json
{
  "title": "UI/UX Designer - Freelance",
  "description": "Looking for a freelance designer for a 2-month project.",
  "requiredSkills": ["Figma", "Adobe XD", "User Research", "Prototyping"],
  "experienceLevel": "three_to_five",
  "seniorityLevel": "mid",
  "jobType": "freelance",
  "engagementLength": "short_term",
  "workMode": "remote",
  "country": "United Kingdom",
  "timezone": "Europe/London",
  "minSalary": 5000,
  "maxSalary": 8000,
  "currency": "GBP",
  "billingType": "fixed",
  "openings": 1
}
```

### Junior Position (Onsite)
```json
{
  "title": "Junior Software Engineer",
  "description": "Entry-level position for recent graduates or developers with 1-3 years of experience.",
  "requiredSkills": ["Python", "Django", "SQL", "Git"],
  "experienceLevel": "one_to_three",
  "seniorityLevel": "junior",
  "jobType": "full_time",
  "engagementLength": "long_term",
  "workMode": "onsite",
  "country": "Germany",
  "timezone": "Europe/Berlin",
  "minSalary": 45000,
  "maxSalary": 60000,
  "currency": "EUR",
  "billingType": "monthly",
  "openings": 3,
  "priority": "normal"
}
```

### Published Job (Ready to Post)
```json
{
  "title": "DevOps Engineer",
  "description": "We need an experienced DevOps engineer to manage our cloud infrastructure.",
  "requiredSkills": ["Kubernetes", "Terraform", "AWS", "CI/CD", "Docker"],
  "experienceLevel": "five_plus",
  "seniorityLevel": "expert",
  "jobType": "full_time",
  "engagementLength": "long_term",
  "workMode": "remote",
  "country": "United States",
  "timezone": "America/Los_Angeles",
  "minSalary": 140000,
  "maxSalary": 200000,
  "currency": "USD",
  "billingType": "monthly",
  "openings": 1,
  "priority": "high",
  "status": "published",
  "expiresAt": "2025-12-31T23:59:59.000Z"
}
```

---

## Enum Values Reference

### ExperienceLevel
- `one_to_three` - 1-3 years of experience
- `three_to_five` - 3-5 years of experience
- `five_plus` - 5+ years of experience

### SeniorityLevel
- `junior` - Junior level
- `mid` - Mid-level
- `senior` - Senior level
- `expert` - Expert level

### JobType
- `full_time` - Full-time employment
- `part_time` - Part-time employment
- `contract` - Contract position
- `freelance` - Freelance work

### EngagementType
- `short_term` - Short-term engagement
- `long_term` - Long-term engagement

### WorkMode
- `remote` - Fully remote
- `hybrid` - Hybrid (mix of remote and onsite)
- `onsite` - Onsite only

### BillingType
- `hourly` - Hourly rate
- `monthly` - Monthly salary
- `fixed` - Fixed project fee

### JobPriority
- `low` - Low priority
- `normal` - Normal priority (default)
- `high` - High priority

### JobStatus
- `draft` - Draft (default)
- `published` - Published and live
- `paused` - Temporarily paused
- `closed` - Closed/No longer accepting applications

---

## Notes

1. **Date Format**: All date fields (`hiringDeadline`, `publishedAt`, `expiresAt`) should be in ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`

2. **Salary Validation**: 
   - `minSalary` must be less than or equal to `maxSalary`
   - Both should be positive integers

3. **Auto-set Fields**:
   - If `status` is set to `published` and `publishedAt` is not provided, it will be automatically set to the current timestamp
   - `openings` defaults to `1` if not provided
   - `priority` defaults to `normal` if not provided
   - `status` defaults to `draft` if not provided

4. **Client ID**: The `clientId` is automatically set from the authenticated user's token, so you don't need to include it in the payload.

5. **Currency Codes**: Use ISO 4217 currency codes (e.g., USD, EUR, GBP, CAD, AED)

6. **Timezone**: Use IANA timezone identifiers (e.g., America/New_York, Europe/London, Asia/Dubai)
