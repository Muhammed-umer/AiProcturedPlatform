# Architecture

A departmental online examination system. Staff build and analyse tests from an
admin panel; students take them under a locked, timed screen. Everything runs on
a server inside the college network with no internet dependency during a test.

**Stack:** Next.js 16 (App Router, Server Components, Server Actions), React 19,
TypeScript, Drizzle ORM on PostgreSQL, Tailwind CSS v4.

---

## What is built

### Admin panel

- Live monitoring of a test in progress: who is writing, how far along they
  are, their warning count and time left, refreshing every few seconds, with a
  per-student end-now override.
- Import questions from a Word or PDF paper. The document is read by Claude into
  draft questions, which the admin checks and edits on a review screen before
  saving. Needs an internet connection and an API key, at authoring time only.
- Create groups, such as a batch or a section.
- Import students from a spreadsheet with roll number, name and email. Choose an
  existing group or create a new one during the upload. Default passwords are
  generated and shown once for printing.
- Reset any student's password, and handle reset requests students raise.
- Build tests with a duration, a warning limit and multiple sections.
- Three question types: one answer, several answers, and fill in the blank.
- Marks default per section and can be overridden on any single question.
  Negative marking is per section and off by default.
- Import questions from a spreadsheet. Sections named in the file are created
  automatically, and rows that fail validation are reported rather than dropped.
- Assign a test to one or more groups, editable at any time including after
  publishing, which is how a live test gets opened up to another group.
- Results: rank list, class average, highest and lowest, top and lowest
  performer, topic-wise section averages, and per-question difficulty.
- Export results and topic analysis to Excel.

### Student panel

- Sign in with roll number, then set a password and a security question on first
  use.
- Reset a forgotten password by answering that security question, with a
  request-to-staff fallback.
- See assigned tests, start one, and work through a paginated paper with a
  question palette showing what has been answered.
- Answers save to the server as they are chosen.
- Score and section breakdown after submission, and a question-by-question
  review showing what they chose, what was correct, and any explanation.
  The review separates the three outcomes - answered correctly, answered
  wrongly, and never attempted - with a count of each and a filter to show
  just one. Within a question, green always marks the right answer and red
  only ever marks an option this student picked that was not.
  Both the score and the review are per-test switches an admin controls; the
  review is worth turning off when several batches sit the same paper, since
  it hands the answer key to whoever sits it first.

### Exam lockdown

- Full screen is required to begin and enforced throughout.
- Copy, cut, paste, right-click, text selection and printing are disabled.
- Developer tools, reload and save shortcuts are intercepted.
- Switching tabs, losing focus or leaving full screen is detected and recorded.
- Each violation shows a warning. Reaching the limit submits the test.
- The countdown, the warning count and the auto-submit decision all live on the
  server, so disconnecting or changing the system clock gains nothing.

### Camera proctoring

- A test opens on an instructions screen listing the rules, followed by a
  checklist the student must clear before the Continue button unlocks: turn the
  camera on and be seen by it (the preview appears in place so they can confirm
  they are in frame), and tick that they agree to the instructions. Only then
  do full screen, the clock and the warnings begin.
- **No warning of any kind can be raised before the student continues.** Every
  detector - camera, tab switching, losing focus, copy and paste - funnels
  through one guard in the exam runner that returns early until the test has
  actually started, and any camera episode that built up on the instructions
  screen is discarded.
- `PROCTOR_FACE_GATE=off` relaxes only the start-time face requirement, for a
  lab whose webcams the detector cannot cope with. It is read on the server, so
  a student cannot switch it off, and it does not affect warnings during a test.
- While a test is open the student navigation, including **Sign out**, is not
  rendered at all. The exam screen owns the whole viewport and offers no way
  out other than submitting.
- A small self-view in the corner shows the student the camera is on and what
  it currently sees ("Face seen", "No face seen", "Turned away"), so they can
  correct themselves before it costs a warning.
- Face detection runs **in the student's browser** using a bundled MediaPipe
  model (`public/proctor/`), so it needs no internet and no server GPU. It
  counts faces; it does not identify anyone.
- Four camera violations exist: `no_face`, `multiple_faces`, `looking_away`
  and `camera_off`. They go through the same warning funnel as tab-switching
  and count toward the auto-submit limit.
- Turning away is measured from the detector's face keypoints: the nose is
  compared against the student's own two ears, so sitting off to one side of
  the frame is not mistaken for a turn, only actually rotating the head is.
  `HEAD_TURN_LIMIT` is the tuning knob.
- To protect students from false alarms, a condition must hold continuously
  before it flags: turned away for 3 seconds, more than one face for 4, no
  face for 8. If it persists after a flag, it flags again only every 30
  seconds, and the moment the condition clears the timer resets. Frames are
  checked every second. This logic is pure and unit-tested
  (`src/lib/proctor-flags.ts`).
- The rules are listed for the student on the start screen, before they begin.
- Frames are small 320×240 JPEGs. Only two kinds are kept: one continuously
  overwritten "latest" frame per student for the live monitor, and one frame
  saved at the moment of each camera violation as evidence. They live in
  PostgreSQL (`proctor_snapshots`), so `pg_dump` covers them.
- The live monitor shows each student's latest frame and a camera-review page
  per attempt lists every flagged moment.
- Not built: eye-gaze tracking. Head turn is detected, but where the eyes are
  pointing within a forward-facing head is not, because that needs a heavier
  model and is far more prone to wrongly ending a test.

---

## Project layout

```
src/
  app/
    actions/        server actions: auth, admin, attempt, monitor, imports
    admin/          admin panel pages
    student/        student pages and the exam runner
    api/            template downloads, Excel export, webcam frame images
    login/          sign-in screen
    first-login/    forced password + security-question setup on first use
    forgot-password/ self-service reset via the security question
  components/       shared UI pieces
  db/               Drizzle schema and connection
  lib/              grading, analytics, parsing, shuffling, passwords, sessions
    __tests__/      unit tests for the pure logic above
  types/            ambient type declaration for pdf-parse
public/proctor/     face-detection model (committed) and MediaPipe runtime
                    (copied from node_modules on install, not committed)
scripts/            database seed and reset, proctor asset copy
e2e/                Playwright end-to-end tests
docs/               this folder
```

The pure logic that decides marks and rankings (`src/lib/grading.ts`,
`src/lib/analytics.ts`, `src/lib/shuffle.ts`, `src/lib/excel-parse.ts`) has no
framework or database dependency, which is what makes it unit-testable in
isolation.

---

## Optional feature: Word and PDF question extraction

This feature reads a question paper into draft questions using Claude, so it
needs an internet connection and an API key. It runs only while staff prepare a
test, never during one, so a live exam never depends on it.

To switch it on, set `ANTHROPIC_API_KEY` in `.env` on a machine with internet
and restart. Left blank, the Word/PDF import panel explains it is off and points
staff at the spreadsheet import, which needs no such setup and works offline.

---

## Not yet built

- **Email delivery.** Password resets are handled in person, because the lab
  server has no outbound mail.
- **Scanned-image PDFs.** Only PDFs with a real text layer are read. A scan of a
  printed page comes through nearly empty; retype those or use the spreadsheet.

AI question generation by subject, subtopic and difficulty is planned and
documented in [placement-upgrade-plan.html](placement-upgrade-plan.html); camera
proctoring from that plan is now built.

---

## One honest limitation

A browser can detect that a student switched tabs within a fraction of a second,
and this application does, but it cannot physically prevent the key press. The
same is true of Alt+Tab and the Windows key, which belong to the operating
system. The design therefore warns, escalates, and ends the test, which deters
effectively and leaves a record.

Preventing those keys outright needs the lab machines configured with a
restricted exam account, which is a one-time job for lab staff and is worth
doing before a real placement drive.
