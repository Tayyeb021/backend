# Job Update API Payload Examples

## API Endpoint
```
PUT /jobs/:id
```

## Authentication
Requires JWT Bearer token

---

## Important Notes

1. **All fields are optional** - You can update any combination of fields
2. **Partial updates** - Only include the fields you want to change
3. **Validation** - Same validation rules apply as create (e.g., minSalary ≤ maxSalary)
4. **Auto-behavior**:
   - If `status` changes to `published` and `publishedAt` is not provided, it will be automatically set to current timestamp
   - If `status` changes away from `published`, `publishedAt` will be cleared

---

## 1. Update Single Field Examples

### Update Title Only
```json
{
  "title": "Updated Job Title"
}
```

### Update Status Only
```json
{
  "status": "published"
}
```

### Update Salary Range Only
```json
{
  "minSalary": 130000,
  "maxSalary": 190000,
  "currency": "USD"
}
```

### Update Work Mode Only
```json
{
  "workMode": "hybrid"
}
```

---

## 2. Update Multiple Fields

### Update Basic Info
```json
{
  "title": "Senior Full Stack Developer - Updated",
  "description": "Updated job description with new requirements.",
  "requiredSkills": ["JavaScript", "TypeScript", "React", "Node.js", "PostgreSQL", "AWS", "Docker"]
}
```

### Update Job Type and Engagement
```json
{
  "jobType": "contract",
  "engagementLength": "short_term",
  "workMode": "remote"
}
```

### Update Compensation
```json
{
  "minSalary": 140000,
  "maxSalary": 200000,
  "currency": "USD",
  "billingType": "monthly"
}
```

### Update Hiring Info
```json
{
  "openings": 3,
  "hiringDeadline": "2025-04-30T23:59:59.000Z",
  "priority": "high"
}
```

---

## 3. Full Payload (All Fields)

```json
{
  "title": "Senior Full Stack Developer - Updated",
  "description": "We are looking for an experienced full stack developer to join our dynamic team. Updated requirements.",
  
  "requiredSkills": [
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "PostgreSQL",
    "AWS",
    "Docker",
    "GraphQL",
    "Kubernetes"
  ],
  
  "experienceLevel": "five_plus",
  "seniorityLevel": "expert",
  
  "jobType": "full_time",
  "engagementLength": "long_term",
  "workMode": "hybrid",
  
  "country": "United States",
  "timezone": "America/Los_Angeles",
  
  "minSalary": 140000,
  "maxSalary": 200000,
  "currency": "USD",
  "billingType": "monthly",
  
  "openings": 3,
  "hiringDeadline": "2025-04-30T23:59:59.000Z",
  "priority": "high",
  
  "status": "published",
  "publishedAt": "2025-01-20T00:00:00.000Z",
  "expiresAt": "2025-07-31T23:59:59.000Z"
}
```

---

## 4. Common Update Scenarios

### Publish a Draft Job
```json
{
  "status": "published"
}
```
Note: `publishedAt` will be automatically set if not provided.

### Pause a Published Job
```json
{
  "status": "paused"
}
```
Note: `publishedAt` will be cleared automatically.

### Update Salary After Negotiation
```json
{
  "minSalary": 150000,
  "maxSalary": 220000,
  "currency": "USD"
}
```

### Extend Hiring Deadline
```json
{
  "hiringDeadline": "2025-05-31T23:59:59.000Z"
}
```

### Change from Remote to Hybrid
```json
{
  "workMode": "hybrid",
  "country": "United States",
  "timezone": "America/New_York"
}
```

### Update Priority and Openings
```json
{
  "priority": "high",
  "openings": 5
}
```

### Update Experience Requirements
```json
{
  "experienceLevel": "three_to_five",
  "seniorityLevel": "mid"
}
```

### Update Job Type and Engagement
```json
{
  "jobType": "contract",
  "engagementLength": "short_term"
}
```

### Clear Optional Fields (Set to null)
```json
{
  "hiringDeadline": null,
  "expiresAt": null,
  "country": null,
  "timezone": null
}
```

---

## 5. Status Transition Examples

### Draft → Published
```json
{
  "status": "published"
}
```
Result: `publishedAt` will be set to current timestamp automatically.

### Published → Paused
```json
{
  "status": "paused"
}
```
Result: `publishedAt` will be cleared automatically.

### Paused → Published
```json
{
  "status": "published",
  "publishedAt": "2025-01-25T00:00:00.000Z"
}
```

### Any Status → Closed
```json
{
  "status": "closed"
}
```

---

## 6. Date Field Updates

### Update Hiring Deadline
```json
{
  "hiringDeadline": "2025-06-30T23:59:59.000Z"
}
```

### Update Expiration Date
```json
{
  "expiresAt": "2025-12-31T23:59:59.000Z"
}
```

### Update Published Date
```json
{
  "publishedAt": "2025-02-01T00:00:00.000Z"
}
```

### Clear Dates
```json
{
  "hiringDeadline": null,
  "expiresAt": null,
  "publishedAt": null
}
```

---

## 7. Enum Values Reference

### JobStatus
- `draft`
- `published`
- `paused`
- `closed`

### JobType
- `full_time`
- `part_time`
- `contract`
- `freelance`

### WorkMode
- `remote`
- `hybrid`
- `onsite`

### EngagementType
- `short_term`
- `long_term`

### ExperienceLevel
- `one_to_three`
- `three_to_five`
- `five_plus`

### SeniorityLevel
- `junior`
- `mid`
- `senior`
- `expert`

### BillingType
- `hourly`
- `monthly`
- `fixed`

### JobPriority
- `low`
- `normal`
- `high`

---

## 8. cURL Examples

### Update Title and Description
```bash
curl -X PUT "http://localhost:3001/jobs/{job-id}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Updated Job Title",
    "description": "Updated description"
  }'
```

### Publish a Job
```bash
curl -X PUT "http://localhost:3001/jobs/{job-id}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "status": "published"
  }'
```

### Update Salary Range
```bash
curl -X PUT "http://localhost:3001/jobs/{job-id}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "minSalary": 150000,
    "maxSalary": 220000,
    "currency": "USD"
  }'
```

### Full Update
```bash
curl -X PUT "http://localhost:3001/jobs/{job-id}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Senior Full Stack Developer",
    "description": "Updated description",
    "requiredSkills": ["JavaScript", "TypeScript", "React"],
    "experienceLevel": "five_plus",
    "seniorityLevel": "senior",
    "jobType": "full_time",
    "engagementLength": "long_term",
    "workMode": "remote",
    "country": "United States",
    "timezone": "America/New_York",
    "minSalary": 140000,
    "maxSalary": 200000,
    "currency": "USD",
    "billingType": "monthly",
    "openings": 3,
    "hiringDeadline": "2025-04-30T23:59:59.000Z",
    "priority": "high",
    "status": "published",
    "expiresAt": "2025-07-31T23:59:59.000Z"
  }'
```

---

## 9. Validation Rules

1. **Salary Range**: `minSalary` must be ≤ `maxSalary` (if both provided)
2. **Date Format**: All date fields must be ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`
3. **Required Skills**: Must be an array of strings
4. **Enums**: Must match exact enum values (case-sensitive)
5. **Numbers**: 
   - `minSalary`, `maxSalary` must be ≥ 0
   - `openings` must be ≥ 1
6. **Strings**: 
   - `title`, `description` cannot be empty if provided
   - `requiredSkills` cannot be empty array if provided

---

## 10. Response

The API returns the updated job object:

```json
{
  "id": "uuid-here",
  "title": "Updated Job Title",
  "description": "Updated description",
  "requiredSkills": ["JavaScript", "TypeScript"],
  "experienceLevel": "five_plus",
  "seniorityLevel": "senior",
  "jobType": "full_time",
  "engagementLength": "long_term",
  "workMode": "remote",
  "country": "United States",
  "timezone": "America/New_York",
  "minSalary": 140000,
  "maxSalary": 200000,
  "currency": "USD",
  "billingType": "monthly",
  "openings": 3,
  "hiringDeadline": "2025-04-30T23:59:59.000Z",
  "priority": "high",
  "status": "published",
  "publishedAt": "2025-01-20T00:00:00.000Z",
  "expiresAt": "2025-07-31T23:59:59.000Z",
  "clientId": "client-uuid",
  "createdAt": "2025-01-18T15:00:00.000Z",
  "updatedAt": "2025-01-20T10:30:00.000Z"
}
```

---

## Summary

- **All fields are optional** - Update only what you need
- **Partial updates supported** - Send only changed fields
- **Auto-behavior** - Status changes trigger automatic `publishedAt` updates
- **Same validation** - All create validation rules apply
- **Flexible** - Update single field or multiple fields at once
