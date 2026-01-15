# API Documentation

This folder contains API request and response samples for all endpoints in the Falcon AI Recruiter backend.

## Structure

Each API module has its own folder containing:
- Request examples (JSON format)
- Response examples (JSON format)
- Error response examples
- cURL command examples

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Base URL

- **Development**: `http://localhost:3001`
- **Production**: `<your-production-url>`

## API Modules

- [Auth APIs](./auth/README.md) - Authentication and user management
- [Clients APIs](./clients/README.md) - Client management (companies and individuals)
- More modules coming soon...
