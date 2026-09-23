# Deployment

## Requirements

- Node.js 20.9 or newer (this project was built and verified on Node 24).
- PostgreSQL 14 or newer.

---

## First-time setup

**1. Install PostgreSQL** and create a database:

```sql
CREATE DATABASE placement_test;
```

**2. Configure the environment.** Copy the example file and edit it:

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | 32+ random characters. The server will not start with the example value. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `SECURE_COOKIES` | `true` once the app is served over HTTPS (see below). `false` for plain-HTTP development. |
| `PROCTOR_FACE_GATE` | `on` by default: a student must be visible to the camera before a test will start. `off` relaxes only that check. |
| `ANTHROPIC_API_KEY` | Optional. Only for Word/PDF question extraction. Leave blank to disable. |

**3. Install dependencies and create the tables:**

```bash
npm install
npm run db:push
```

`npm install` also copies the MediaPipe face-detection runtime into
`public/proctor/wasm/` (about 35 MB, not committed). The face model itself is
committed, so nothing else is downloaded.

**4. Seed the first admin account and some demo data:**

```bash
npm run db:seed
```

This creates one admin (`admin` / `admin`), one demo student (`user` / `user`)
and a sample test. Change the admin password from the first-login screen or
by resetting it before any real exam.

> Seeding **replaces every account**. To protect a live server it refuses to
> run once any test has been submitted; `npm run db:seed -- --force` overrides
> that on a development machine. Never run it on the lab server after the
> first day.

**5. Start the server:**

```bash
npm run dev                  # development, with hot reload
npm run build && npm start   # production
```

Open `http://localhost:3000`.

---

## Running it on the lab server

### HTTPS is required

Tests are camera proctored, and browsers only allow webcam access in a
**secure context**: HTTPS, or `localhost`. Over plain `http://<server-ip>:3000`
the camera silently fails on every lab desktop and no student can start. So the
lab server must serve the app over HTTPS. This is a one-time setup:

1. **Start the app** in production mode, bound to the local machine only:

   ```bash
   npm run build
   npx next start -H 127.0.0.1 -p 3000
   ```

2. **Put a reverse proxy in front of it that terminates TLS.** The simplest is
   [Caddy](https://caddyserver.com/) (a single executable). A `Caddyfile`:

   ```
   exam.lab.local {
       tls internal
       reverse_proxy 127.0.0.1:3000
   }
   ```

   `tls internal` makes Caddy issue a certificate from its own local
   certificate authority. Give the server a fixed IP and add `exam.lab.local`
   to the lab DNS or the desktops' hosts file.

3. **Trust that certificate authority on the lab desktops**, once. Caddy's root
   certificate is at `~/.local/share/caddy/pki/authorities/local/root.crt`
   (or the equivalent Windows path); install it into each desktop's trusted
   root store, by hand or by group policy.

4. **Set `SECURE_COOKIES=true`** in `.env` and restart the app.

Students then open `https://exam.lab.local/`. Because the origin is now trusted
and stable, the browser's camera permission can also be pre-granted by policy
so students are never asked.

Development is unaffected: `localhost` is already a secure context, so the
camera works with `npm run dev` and no certificate.

### Before a real drive

- **Back up the database** before and after each session with `pg_dump`, and
  practise a restore at least once. Webcam frames are in the database too.
- **Keep the server awake.** Disable sleep and screen lock on that machine.
- **Check one lab desktop end to end:** open the HTTPS address, start the
  sample test, confirm the camera self-view appears and the admin monitor shows
  that desktop's thumbnail.

---

## Resetting the development database

To start over completely:

```bash
npm run db:reset && npm run db:push && npm run db:seed
```

`db:reset` drops every table. Like the seed, it refuses when the database holds
submitted tests (add `-- --force` on a development machine) and always refuses
with `NODE_ENV=production`.

---

## Before a real exam: checklist

1. `SESSION_SECRET` is a fresh random value (the server refuses the example).
2. The admin password is no longer `admin`.
3. The site is served over HTTPS and `SECURE_COOKIES=true` (the camera needs it).
4. It runs as `npm run build && npm start`, never `npm run dev`: development
   mode shows every account on the sign-in page.
5. A spare admin knows how to reset a student's password (Students page). A
   student who types a wrong password 8 times is paused for 5 minutes; an admin
   reset lifts that at once.

## Capacity

Measured on a laptop with `scripts/load` (see docs/testing.md): 100 students
opening, pressing Continue, answering, uploading webcam frames every 15 s and
all submitting in the same second, with the live monitor open throughout, ran
with no errors and every answer stored and graded. Everyone submitting at once
took under a second; 100 simultaneous sign-ins take about 2 s and do not stall
students already writing.
