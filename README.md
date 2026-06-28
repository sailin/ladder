# 🏸 Ladder — Badminton Tournament Manager

A mobile-first web app for managing badminton ladder tournaments. Coaches create groups and tournaments, players sign up — the system generates Round Robin match schedules, handles score submissions in real time, and supports weekly ladder carry-over (promotion/relegation).

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router + Turbopack)
- **Database**: PostgreSQL with [Prisma 7](https://www.prisma.io)
- **Auth**: [NextAuth.js v5](https://authjs.dev) (credentials provider)
- **Real-time**: [Socket.io](https://socket.io) (match & ladder updates)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com)
- **Runtime**: Node.js with TypeScript

## Features

- **Coach dashboard**: create groups, tournaments, weekly ladders; generate matches; move players between ladders; manage scores
- **Player dashboard**: join groups via invitation code, sign up for tournaments, pick doubles partners, submit scores
- **Round Robin engine**: circle-method match scheduling; auto-pairing for doubles
- **Real-time updates**: WebSocket push for match scores and ladder changes
- **Mobile-first UI**: touch-friendly, safe-area aware, bottom navigation

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (or a running PostgreSQL instance)
- npm

### 1. Clone & Install

```bash
git clone git@github.com:sailin/ladder.git
cd ladder
npm install
```

### 2. Set up environment

```bash
cp .env.template .env
```

Edit `.env` — fill in your `DATABASE_URL`, `AUTH_SECRET`, and `NEXTAUTH_URL`.

### 3. Start PostgreSQL (via Docker)

```bash
docker run -d --name ladder-postgres \
  -e POSTGRES_USER=ladder \
  -e POSTGRES_PASSWORD=ladder123 \
  -e POSTGRES_DB=ladder \
  -p 5432:5432 \
  -v ~/docker-data/postgres:/var/lib/postgresql/data \
  postgres:16-alpine
```

### 4. Run migrations & seed

```bash
npx prisma migrate dev
npx tsx prisma/seed.ts
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> For remote access, use `npm run dev` (which runs `next dev -H 0.0.0.0`).
> Use `npm run dev:full` to include the Socket.io server — required for
> real-time updates, but HMR WebSocket is not available in that mode.

### Demo Credentials

| Role   | Email               | Password      |
|--------|---------------------|---------------|
| Coach  | coach@ladder.app    | password123   |
| Player | alice@ladder.app    | password123   |
| Player | bob@ladder.app      | password123   |

Invite code: **`LADDER01`**

## Deploy

### Build for production

```bash
npm run build
```

### Run with Socket.io

```bash
npm run start
```

This uses the custom server (`server.ts`) which serves Next.js and Socket.io on the same port. Set `NODE_ENV=production` and configure your `.env` variables for the production environment.

### Environment Variables

| Variable        | Required | Description                           |
|-----------------|----------|---------------------------------------|
| `DATABASE_URL`  | Yes      | PostgreSQL connection string          |
| `AUTH_SECRET`   | Yes      | NextAuth.js secret (min 32 chars)     |
| `NEXTAUTH_URL`  | Yes      | Canonical URL of the deployed site    |
| `PORT`          | No       | Server port (default: 3000)           |

### Database

The production build uses Prisma with the `@prisma/adapter-pg` driver. Make sure your `DATABASE_URL` uses the standard `postgres://` protocol:

```
DATABASE_URL="postgres://user:password@host:5432/dbname"
```

Run migrations before starting:

```bash
npx prisma migrate deploy
```

### One-click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sailin/ladder)

> Note: Socket.io requires a long-running server. For Vercel serverless deployments,
> disable real-time features or use a separate Socket.io server.
