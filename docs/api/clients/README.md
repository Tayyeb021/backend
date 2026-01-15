# Clients API Documentation

Client management endpoints for companies and individuals.

## Endpoints

1. [Create Client](#create-client)
2. [Get All Clients](#get-all-clients)
3. [Get Client by ID](#get-client-by-id)
4. [Update Client](#update-client)
5. [Delete Client](#delete-client)
6. [Get Clients by Type](#get-clients-by-type)

---

## Create Client

Create a new client (company or individual). This is a **public endpoint** and does not require authentication.

**Endpoint:** `POST /clients`

**Headers:** (Optional - authentication is not required)
```
Authorization: Bearer <your-access-token>  (optional)
```

**Request Body (Company):**
```json
{
  "type": "company",
  "email": "contact@techcorp.com",
  "phone": "+1-555-0123",
  "address": "123 Business St",
  "city": "New York",
  "state": "NY",
  "country": "USA",
  "postalCode": "10001",
  "status": "active",
  "companyName": "TechCorp Inc.",
  "companyRegistrationNumber": "REG-12345",
  "taxId": "TAX-98765",
  "vatNumber": "VAT-45678",
  "industry": "Technology",
  "companySize": "50-200",
  "website": "https://techcorp.com",
  "contactPersonFirstName": "John",
  "contactPersonLastName": "Smith",
  "contactPersonEmail": "john.smith@techcorp.com",
  "contactPersonPhone": "+1-555-0124",
  "contactPersonTitle": "HR Manager",
  "notes": "Preferred contact method: Email"
}
```

**Request Body (Individual):**
```json
{
  "type": "individual",
  "email": "jane.doe@example.com",
  "phone": "+1-555-0456",
  "address": "456 Personal Ave",
  "city": "Los Angeles",
  "state": "CA",
  "country": "USA",
  "postalCode": "90001",
  "status": "active",
  "firstName": "Jane",
  "lastName": "Doe",
  "dateOfBirth": "1990-05-15",
  "nationalId": "NID-123456",
  "passportNumber": "P1234567",
  "notes": "Prefers phone communication"
}
```

**cURL Example (Company):**
```bash
curl -X POST http://localhost:3001/clients \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "company",
    "email": "contact@techcorp.com",
    "companyName": "TechCorp Inc.",
    "phone": "+1-555-0123"
  }'
```

**Success Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "company",
  "email": "contact@techcorp.com",
  "phone": "+1-555-0123",
  "address": "123 Business St",
  "city": "New York",
  "state": "NY",
  "country": "USA",
  "postalCode": "10001",
  "status": "active",
  "companyName": "TechCorp Inc.",
  "companyRegistrationNumber": "REG-12345",
  "taxId": "TAX-98765",
  "vatNumber": "VAT-45678",
  "industry": "Technology",
  "companySize": "50-200",
  "website": "https://techcorp.com",
  "contactPersonFirstName": "John",
  "contactPersonLastName": "Smith",
  "contactPersonEmail": "john.smith@techcorp.com",
  "contactPersonPhone": "+1-555-0124",
  "contactPersonTitle": "HR Manager",
  "notes": "Preferred contact method: Email",
  "createdById": "user-uuid-here",
  "createdAt": "2025-01-14T12:00:00.000Z",
  "updatedAt": "2025-01-14T12:00:00.000Z"
}
```

**Error Response (409 Conflict) - Email Already Exists:**
```json
{
  "statusCode": 409,
  "message": "Client with this email already exists",
  "error": "Conflict"
}
```

**Error Response (400 Bad Request) - Validation Error:**
```json
{
  "statusCode": 400,
  "message": [
    "type must be one of the following values: company, individual",
    "email must be an email",
    "companyName should not be empty"
  ],
  "error": "Bad Request"
}
```

---

## Get All Clients

Get all clients created by the authenticated user.

**Endpoint:** `GET /clients`

**Headers:**
```
Authorization: Bearer <your-access-token>
```

**Query Parameters:**
- `type` (optional): Filter by client type (`company` or `individual`)

**cURL Example:**
```bash
curl -X GET http://localhost:3001/clients \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**cURL Example (Filter by Type):**
```bash
curl -X GET "http://localhost:3001/clients?type=company" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "company",
    "email": "contact@techcorp.com",
    "companyName": "TechCorp Inc.",
    "status": "active",
    "createdAt": "2025-01-14T12:00:00.000Z",
    "createdBy": {
      "id": "user-uuid",
      "email": "recruiter@example.com",
      "firstName": "Recruiter",
      "lastName": "Name"
    }
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "type": "individual",
    "email": "jane.doe@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "status": "active",
    "createdAt": "2025-01-14T11:00:00.000Z",
    "createdBy": {
      "id": "user-uuid",
      "email": "recruiter@example.com",
      "firstName": "Recruiter",
      "lastName": "Name"
    }
  }
]
```

---

## Get Client by ID

Get a specific client by ID.

**Endpoint:** `GET /clients/:id`

**Headers:**
```
Authorization: Bearer <your-access-token>
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/clients/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "company",
  "email": "contact@techcorp.com",
  "phone": "+1-555-0123",
  "address": "123 Business St",
  "city": "New York",
  "state": "NY",
  "country": "USA",
  "postalCode": "10001",
  "status": "active",
  "companyName": "TechCorp Inc.",
  "companyRegistrationNumber": "REG-12345",
  "taxId": "TAX-98765",
  "vatNumber": "VAT-45678",
  "industry": "Technology",
  "companySize": "50-200",
  "website": "https://techcorp.com",
  "contactPersonFirstName": "John",
  "contactPersonLastName": "Smith",
  "contactPersonEmail": "john.smith@techcorp.com",
  "contactPersonPhone": "+1-555-0124",
  "contactPersonTitle": "HR Manager",
  "notes": "Preferred contact method: Email",
  "createdById": "user-uuid-here",
  "createdAt": "2025-01-14T12:00:00.000Z",
  "updatedAt": "2025-01-14T12:00:00.000Z",
  "createdBy": {
    "id": "user-uuid",
    "email": "recruiter@example.com",
    "firstName": "Recruiter",
    "lastName": "Name"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "message": "Client with ID 550e8400-e29b-41d4-a716-446655440000 not found",
  "error": "Not Found"
}
```

---

## Update Client

Update an existing client.

**Endpoint:** `PATCH /clients/:id`

**Headers:**
```
Authorization: Bearer <your-access-token>
```

**Request Body:**
```json
{
  "phone": "+1-555-9999",
  "status": "inactive",
  "notes": "Updated notes"
}
```

**cURL Example:**
```bash
curl -X PATCH http://localhost:3001/clients/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1-555-9999",
    "status": "inactive"
  }'
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "company",
  "email": "contact@techcorp.com",
  "phone": "+1-555-9999",
  "status": "inactive",
  "updatedAt": "2025-01-14T13:00:00.000Z"
}
```

**Error Response (409 Conflict) - Email Already Exists:**
```json
{
  "statusCode": 409,
  "message": "Client with this email already exists",
  "error": "Conflict"
}
```

---

## Delete Client

Delete a client.

**Endpoint:** `DELETE /clients/:id`

**Headers:**
```
Authorization: Bearer <your-access-token>
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:3001/clients/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "company",
  "email": "contact@techcorp.com"
}
```

**Error Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "message": "Client with ID 550e8400-e29b-41d4-a716-446655440000 not found",
  "error": "Not Found"
}
```

---

## Get Clients by Type

Get clients filtered by type (company or individual).

**Endpoint:** `GET /clients?type=company` or `GET /clients?type=individual`

**Headers:**
```
Authorization: Bearer <your-access-token>
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3001/clients?type=company" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "company",
    "email": "contact@techcorp.com",
    "companyName": "TechCorp Inc.",
    "status": "active"
  }
]
```

---

## Notes

- **Create Client** endpoint is **public** (no authentication required)
- All other endpoints require authentication (JWT access token)
- Users can only access clients they created (if authenticated during creation)
- If a client is created without authentication, `createdById` will be `null`
- Email must be unique across all clients
- Client type cannot be changed after creation
- Required fields vary based on client type:
  - **Company**: `type`, `email`, `companyName`
  - **Individual**: `type`, `email`, `firstName`, `lastName`
- Status can be: `active`, `inactive`, or `pending`
- All timestamps are in ISO 8601 format
