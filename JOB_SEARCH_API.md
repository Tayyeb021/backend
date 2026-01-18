# Job Search API Documentation

## Endpoint
**GET** `/jobs`

## Authentication
Requires JWT Bearer token

---

## Query Parameters

All parameters are optional. You can combine multiple filters.

### Pagination
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10, max: 100) - Items per page

### Text Search
- `search` (string) - Searches in title, description, and requiredSkills (case-insensitive)

### Status & Type Filters
- `status` (enum) - Filter by job status: `draft`, `published`, `paused`, `closed`
- `jobType` (enum) - Filter by job type: `full_time`, `part_time`, `contract`, `freelance`
- `workMode` (enum) - Filter by work mode: `remote`, `hybrid`, `onsite`
- `engagementLength` (enum) - Filter by engagement: `short_term`, `long_term`

### Experience & Seniority Filters
- `experienceLevel` (enum) - Filter by experience: `one_to_three`, `three_to_five`, `five_plus`
- `seniorityLevel` (enum) - Filter by seniority: `junior`, `mid`, `senior`, `expert`

### Location Filters
- `country` (string) - Filter by country (partial match, case-insensitive)
- `timezone` (string) - Filter by timezone (partial match, case-insensitive)

### Compensation Filters
- `minSalary` (number) - Minimum salary filter (jobs with minSalary >= this value or null)
- `maxSalary` (number) - Maximum salary filter (jobs with maxSalary <= this value or null)
- `currency` (string) - Filter by currency code (e.g., USD, EUR, GBP)
- `billingType` (enum) - Filter by billing type: `hourly`, `monthly`, `fixed`

### Hiring Info Filters
- `openings` (number) - Filter by number of openings
- `priority` (enum) - Filter by priority: `low`, `normal`, `high`
- `hiringDeadlineFrom` (ISO date string) - Filter jobs with hiring deadline >= this date
- `hiringDeadlineTo` (ISO date string) - Filter jobs with hiring deadline <= this date

### Date Range Filters
- `publishedAtFrom` (ISO date string) - Filter jobs published >= this date
- `publishedAtTo` (ISO date string) - Filter jobs published <= this date
- `expiresAtFrom` (ISO date string) - Filter jobs expiring >= this date
- `expiresAtTo` (ISO date string) - Filter jobs expiring <= this date
- `createdAtFrom` (ISO date string) - Filter jobs created >= this date
- `createdAtTo` (ISO date string) - Filter jobs created <= this date

---

## Example Requests

### Basic List (with pagination)
```bash
GET /jobs?page=1&limit=10
```

### Text Search
```bash
GET /jobs?search=developer
```

### Filter by Status and Type
```bash
GET /jobs?status=published&jobType=full_time&workMode=remote
```

### Filter by Experience and Seniority
```bash
GET /jobs?experienceLevel=five_plus&seniorityLevel=senior
```

### Filter by Salary Range
```bash
GET /jobs?minSalary=100000&maxSalary=200000&currency=USD
```

### Filter by Location
```bash
GET /jobs?country=United States&timezone=America/New_York
```

### Filter by Date Range
```bash
GET /jobs?publishedAtFrom=2025-01-01T00:00:00.000Z&publishedAtTo=2025-12-31T23:59:59.000Z
```

### Complex Search (Multiple Filters)
```bash
GET /jobs?search=full stack&status=published&jobType=full_time&workMode=remote&experienceLevel=five_plus&seniorityLevel=senior&minSalary=120000&maxSalary=180000&currency=USD&country=United States&page=1&limit=20
```

### Filter by Hiring Deadline
```bash
GET /jobs?hiringDeadlineFrom=2025-02-01T00:00:00.000Z&hiringDeadlineTo=2025-03-31T23:59:59.000Z
```

---

## Response Format

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Senior Full Stack Developer",
      "description": "...",
      "requiredSkills": ["JavaScript", "TypeScript"],
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
      "status": "published",
      "publishedAt": "2025-01-20T00:00:00.000Z",
      "expiresAt": "2025-06-30T23:59:59.000Z",
      "clientId": "client-uuid",
      "createdAt": "2025-01-18T15:00:00.000Z",
      "updatedAt": "2025-01-18T15:00:00.000Z",
      "candidates": []
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## cURL Examples

### Simple Search
```bash
curl -X GET "http://localhost:3001/jobs?search=developer&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Filter by Multiple Criteria
```bash
curl -X GET "http://localhost:3001/jobs?status=published&jobType=full_time&workMode=remote&experienceLevel=five_plus&minSalary=100000&maxSalary=200000" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Date Range Filter
```bash
curl -X GET "http://localhost:3001/jobs?publishedAtFrom=2025-01-01T00:00:00.000Z&publishedAtTo=2025-12-31T23:59:59.000Z&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Notes

1. **Text Search**: The `search` parameter searches across:
   - Job title (case-insensitive partial match)
   - Job description (case-insensitive partial match)
   - Required skills array (checks if search term exists in array)

2. **Salary Filters**: 
   - `minSalary` and `maxSalary` work together to filter jobs within a salary range
   - Jobs with null salary values are included (flexible salary)

3. **Date Filters**: 
   - All date parameters should be in ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`
   - Date range filters use `From` and `To` suffixes for start and end dates

4. **Combining Filters**: 
   - All filters work together with AND logic (all conditions must be met)
   - Text search uses OR logic within itself (matches title OR description OR skills)

5. **Pagination**: 
   - Always returns paginated results with metadata
   - Default: page=1, limit=10
   - Maximum limit: 100

6. **Case Sensitivity**: 
   - Text searches (search, country, timezone) are case-insensitive
   - Enum filters are case-sensitive and must match exact enum values
