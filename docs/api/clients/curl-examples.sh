#!/bin/bash

# Base URL
BASE_URL="http://localhost:3001"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Clients API cURL Examples ===${NC}\n"

# Note: Replace YOUR_ACCESS_TOKEN with actual JWT access token
TOKEN="YOUR_ACCESS_TOKEN"

# 1. Create Company Client (Public - No Auth Required)
echo -e "${GREEN}1. Create Company Client (Public Endpoint)${NC}"
echo "POST ${BASE_URL}/clients"
curl -X POST "${BASE_URL}/clients" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "company",
    "email": "contact@techcorp.com",
    "phone": "+1-555-0123",
    "companyName": "TechCorp Inc.",
    "industry": "Technology",
    "status": "active"
  }'
echo -e "\n\n"

# 2. Create Individual Client (Public - No Auth Required)
echo -e "${GREEN}2. Create Individual Client (Public Endpoint)${NC}"
echo "POST ${BASE_URL}/clients"
curl -X POST "${BASE_URL}/clients" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "individual",
    "email": "jane.doe@example.com",
    "phone": "+1-555-0456",
    "firstName": "Jane",
    "lastName": "Doe",
    "status": "active"
  }'
echo -e "\n\n"

# 3. Get All Clients
echo -e "${GREEN}3. Get All Clients${NC}"
echo "GET ${BASE_URL}/clients"
curl -X GET "${BASE_URL}/clients" \
  -H "Authorization: Bearer ${TOKEN}"
echo -e "\n\n"

# 4. Get Clients by Type (Company)
echo -e "${GREEN}4. Get Clients by Type (Company)${NC}"
echo "GET ${BASE_URL}/clients?type=company"
curl -X GET "${BASE_URL}/clients?type=company" \
  -H "Authorization: Bearer ${TOKEN}"
echo -e "\n\n"

# 5. Get Client by ID (Replace CLIENT_ID with actual client ID)
echo -e "${GREEN}5. Get Client by ID${NC}"
echo "GET ${BASE_URL}/clients/CLIENT_ID"
curl -X GET "${BASE_URL}/clients/CLIENT_ID" \
  -H "Authorization: Bearer ${TOKEN}"
echo -e "\n\n"

# 6. Update Client (Replace CLIENT_ID with actual client ID)
echo -e "${GREEN}6. Update Client${NC}"
echo "PATCH ${BASE_URL}/clients/CLIENT_ID"
curl -X PATCH "${BASE_URL}/clients/CLIENT_ID" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1-555-9999",
    "status": "inactive"
  }'
echo -e "\n\n"

# 7. Delete Client (Replace CLIENT_ID with actual client ID)
echo -e "${GREEN}7. Delete Client${NC}"
echo "DELETE ${BASE_URL}/clients/CLIENT_ID"
curl -X DELETE "${BASE_URL}/clients/CLIENT_ID" \
  -H "Authorization: Bearer ${TOKEN}"
echo -e "\n"
