#!/bin/bash

# Base URL
BASE_URL="http://localhost:3001"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Auth API cURL Examples ===${NC}\n"

# 1. Register User (without company)
echo -e "${GREEN}1. Register User (without company)${NC}"
echo "POST ${BASE_URL}/auth/register"
curl -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
echo -e "\n\n"

# 1b. Register Client User with Company Information
echo -e "${GREEN}1b. Register Client User with Company Information${NC}"
echo "POST ${BASE_URL}/auth/register"
curl -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ahmed.hassan@techcorp.ae",
    "password": "SecurePass123!",
    "firstName": "Ahmed",
    "lastName": "Hassan",
    "role": "client",
    "company": {
      "name": "TechCorp Middle East LLC",
      "tradeLicenseNumber": "TL-123456789",
      "registrationNumber": "DED-987654321",
      "vatTrn": "100123456700003",
      "email": "info@techcorp.ae",
      "phone": "+971-4-123-4567",
      "address": "Building 15, Office 201, Dubai Media City",
      "poBox": "12345",
      "city": "Dubai",
      "emirate": "Dubai",
      "country": "UAE",
      "freeZoneName": "Dubai Media City",
      "licenseType": "Commercial",
      "industry": "Technology"
    }
  }'
echo -e "\n\n"

# 1c. Register Interviewee User
echo -e "${GREEN}1c. Register Interviewee User${NC}"
echo "POST ${BASE_URL}/auth/register"
curl -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "candidate@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe",
    "role": "interviewee"
  }'
echo -e "\n\n"

# 1d. Register Admin User (Requires Admin Authentication)
echo -e "${GREEN}1d. Register Admin User (Requires Admin Authentication)${NC}"
echo "POST ${BASE_URL}/auth/register-admin"
echo "Note: Replace YOUR_ADMIN_ACCESS_TOKEN with an admin user's access token"
curl -X POST "${BASE_URL}/auth/register-admin" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN" \
  -d '{
    "email": "admin@falcon-ai.com",
    "password": "SecureAdminPass123!",
    "firstName": "Admin",
    "lastName": "User"
  }'
echo -e "\n\n"

# 2. Login User
echo -e "${GREEN}2. Login User${NC}"
echo "POST ${BASE_URL}/auth/login"
curl -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123!"
  }'
echo -e "\n\n"

# 3. Refresh Access Token (Replace REFRESH_TOKEN with actual refresh token)
echo -e "${GREEN}3. Refresh Access Token${NC}"
echo "POST ${BASE_URL}/auth/refresh"
echo "Note: Replace YOUR_REFRESH_TOKEN with the refreshToken from login response"
curl -X POST "${BASE_URL}/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
echo -e "\n\n"

# 4. Get Current User Profile (Replace ACCESS_TOKEN with actual access token)
echo -e "${GREEN}4. Get Current User Profile${NC}"
echo "GET ${BASE_URL}/auth/me"
echo "Note: Replace YOUR_ACCESS_TOKEN with the accessToken from login response"
curl -X GET "${BASE_URL}/auth/me" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
echo -e "\n"
