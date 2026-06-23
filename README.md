# GoldRisk Backend

GoldRisk Backend is the API layer for GoldRisk AI, an enterprise-oriented gold trading, inventory and financial risk management system.

The service is designed for business workflows where daily prices, transactions, transfers, reconciliation and reporting must be handled through a controlled backend API rather than direct frontend/database access.

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Authentication:** JWT + bcrypt
- **Testing:** Vitest
- **Tooling:** ESLint, tsx, TypeScript compiler

## API Areas

The current backend entrypoint exposes the following route groups:

```text
GET  /health
/auth
/prices
/transactions
/transfers
/reports
/reconciliation
```

## Core Scope

- User authentication
- Daily gold/financial price management
- Transaction tracking
- Transfer workflows
- Reporting endpoints
- Reconciliation workflows
- PostgreSQL-backed financial data model
- Scheduled stock snapshot job support

## Local Development

```bash
npm install
npm run dev
```

Default local port:

```text
http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "ok" }
```

## Build and Run

```bash
npm run build
npm run start
```

## Database Commands

```bash
npm run db:migrate
npm run db:seed
npm run job:snapshot
```

## Test and Quality Commands

```bash
npm run test
npm run test:run
npm run lint
npm run lint:fix
```

## Environment Variables

Create a local `.env` file and keep production secrets outside the repository.

Recommended baseline:

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/goldrisk
JWT_SECRET=change-this-secret
```

## Repository Notes

This repository should remain focused on backend concerns: API routing, authentication, financial domain logic, database access, reconciliation and reporting. Frontend UI code should stay in the separate frontend repository.
