# Placement Test Platform

A departmental online examination system. Staff build and analyse tests from an
admin panel; students take them under a locked, timed, full-screen,
**camera-proctored** exam screen. It runs on a server inside the college network
with **no internet dependency during a test** — face detection runs in the
student's own browser from a bundled model.

Built with Next.js 16, React 19, TypeScript, Drizzle ORM and PostgreSQL.

---

## Quick start

```bash
cp .env.example .env      # then set DATABASE_URL and SESSION_SECRET
npm install
npm run db:push           # create the tables
npm run db:seed           # first admin account + demo data
npm run dev               # http://localhost:3000
```

Sign in as `admin` / `admin`, or as the demo student `user` / `user`. Imported
students get a random password such as `KPRT-4829`, shown once to the admin.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build && npm start` | Production build and server |
| `npm run db:push` | Apply the Drizzle schema to the database |
| `npm run db:seed` | Create the first admin and demo data |
| `npm run db:reset` | Empty the development database (then push and seed again) |
| `npx tsx scripts/load/setup.mts 100` then `run.mts` | Load test: 100 students sitting at once (see docs/testing.md) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |

---

## Documentation

Everything beyond the quick start lives in [`docs/`](docs/README.md):

- **[Architecture](docs/architecture.md)** — what is built, how the code is
  organised, the exam lockdown model, and known limitations.
- **[Deployment](docs/deployment.md)** — requirements, first-time setup, and
  running on the college lab server.
- **[Testing](docs/testing.md)** — the unit and end-to-end suites.
- **[Project scope](docs/project-scope.html)** — the original scope agreed with
  the department.
- **[Upgrade plan](docs/placement-upgrade-plan.html)** — the approved plan for
  camera proctoring and AI question generation.

---

## Project layout

```
src/app/        pages, server actions and API routes (admin, student, login)
src/components/ shared UI pieces
src/db/         Drizzle schema and connection
src/lib/        grading, analytics, parsing, shuffling, passwords, sessions
scripts/        database seed
e2e/            Playwright end-to-end tests
docs/           documentation and department-facing deliverables
```
