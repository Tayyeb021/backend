# Auth API Documentation

Authentication and user management endpoints.

## Endpoints

1. [Register User](#register-user)
2. [Login User](#login-user)
3. [Refresh Access Token](#refresh-access-token)
4. [Get Current User Profile](#get-current-user-profile)

---

## Register User

Register a new user account.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

**Success Response (200 OK):**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john.doe@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "recruiter",
    "isActive": true,
    "createdAt": "2025-01-14T12:00:00.000Z",
    "updatedAt": "2025-01-14T12:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAwIiwiZW1haWwiOiJqb2huLmRvZUBleGFtcGxlLmNvbSIsInJvbGUiOiJyZWNydWl0ZXIiLCJpYXQiOjE3MDUyODgwMDAsImV4cCI6MTcwNTg5MjgwMH0.example"
}
```

**Error Response (409 Conflict) - Email Already Exists:**
```json
{
  "statusCode": 409,
  "message": "User with this email already exists",
  "error": "Conflict"
}
```

**Error Response (400 Bad Request) - Validation Error:**
```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "password must be longer than or equal to 8 characters",
    "firstName should not be empty",
    "lastName should not be empty"
  ],
  "error": "Bad Request"
}
```

---

## Login User

Authenticate and get JWT token.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "SecurePass123!"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123!"
  }'
```

**Success Response (200 OK):**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john.doe@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "recruiter",
    "isActive": true,
    "createdAt": "2025-01-14T12:00:00.000Z",
    "updatedAt": "2025-01-14T12:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAwIiwiZW1haWwiOiJqb2huLmRvZUBleGFtcGxlLmNvbSIsInJvbGUiOiJyZWNydWl0ZXIiLCJpYXQiOjE3MDUyODgwMDAsImV4cCI6MTcwNTg5MjgwMH0.example"
}
```

**Error Response (401 Unauthorized) - Invalid Credentials:**
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

**Error Response (401 Unauthorized) - Account Inactive:**
```json
{
  "statusCode": 401,
  "message": "Account is inactive",
  "error": "Unauthorized"
}
```

**Error Response (400 Bad Request) - Validation Error:**
```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "password should not be empty"
  ],
  "error": "Bad Request"
}
```

---

## Refresh Access Token

Get a new access token using a valid refresh token.

**Endpoint:** `POST /auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Success Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (401 Unauthorized) - Invalid Refresh Token:**
```json
{
  "statusCode": 401,
  "message": "Invalid or expired refresh token",
  "error": "Unauthorized"
}
```

**Error Response (400 Bad Request) - Validation Error:**
```json
{
  "statusCode": 400,
  "message": [
    "refreshToken should not be empty",
    "refreshToken must be a string"
  ],
  "error": "Bad Request"
}
```

---

## Get Current User Profile

Get the authenticated user's profile information.

**Endpoint:** `GET /auth/me`

**Headers:**
```
Authorization: Bearer <your-access-token>
```

**cURL Example:**
```bash
curl -X GET http://localhost:3001/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Note:** Use the `accessToken` from the login/register response, not the `refreshToken`.

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "john.doe@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "recruiter",
  "isActive": true,
  "createdAt": "2025-01-14T12:00:00.000Z",
  "updatedAt": "2025-01-14T12:00:00.000Z"
}
```

**Error Response (401 Unauthorized) - Missing Token:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Error Response (401 Unauthorized) - Invalid Token:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Error Response (401 Unauthorized) - User Not Found or Inactive:**
```json
{
  "statusCode": 401,
  "message": "User not found or inactive",
  "error": "Unauthorized"
}
```

---

## Notes

- **Access Token**: Expires after 15 minutes. Use this for API requests in the `Authorization: Bearer <accessToken>` header.
- **Refresh Token**: Expires after 7 days. Use this to get a new access token when it expires. Refresh tokens are stateless (not stored in database) and validated using JWT signature verification.
- Password must be at least 8 characters long
- Email must be a valid email format
- All users are created with `role: "recruiter"` by default
- Passwords are hashed using bcrypt before storage
- User passwords are never returned in API responses
- Refresh tokens are validated by verifying the JWT signature and checking if the user exists and is active
