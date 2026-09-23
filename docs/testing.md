# Testing

## Unit tests

```bash
npm test          # run once
npm run test:watch
```

103 tests (Vitest) covering the logic that decides marks, rankings and warnings:

| File | Covers |
| --- | --- |
| `src/lib/__tests__/grading.test.ts` | All three question types, marks overrides, negative marking, partial selections, unattempted questions |
| `src/lib/__tests__/analytics.test.ts` | Ranking with ties, class summary, topic-wise averages, per-question difficulty |
| `src/lib/__tests__/excel-parse.test.ts` | Student and question spreadsheet parsing, header variants, every validation rule |
| `src/lib/__tests__/shuffle.test.ts` | Seeded shuffling determinism, password rules, default password generation |
| `src/lib/__tests__/proctor-flags.test.ts` | Camera flag debounce (a short absence never flags, a sustained one flags once, repeats only after the interval, recovery resets) and the head-turn maths (symmetric either way, unaffected by sitting off-centre, degrades safely with missing keypoints) |

The database, the network and the browser are not mocked. These tests cover pure
logic only, which is deliberate: it is the part where a silent mistake would
change somebody's marks or wrongly end their test.

---

## End-to-end tests

```bash
npm run test:e2e
```

Playwright drives a real Chromium browser against a **production build** of the
app and a **live PostgreSQL database**. There are two spec files, 18 tests in
all. Both sign in through `e2e/admin-auth.ts`, which copes with the admin
account whether or not its first-login password change has already been done,
so neither file depends on which one Playwright runs first.

### `admin-crud.spec.ts` - creating, editing and deleting

The edit and delete paths, where a mistake is quiet:

1. Creating two groups, and refusing a duplicate name.
2. Creating a test, and refusing to publish it while it has no questions.
3. A section added, renamed, its marks changed, reloaded to prove it saved,
   then deleted; the last remaining section stays.
4. Two questions added, one deleted, the other left alone.
5. Groups assigned to the test, then one taken away again.
6. The after-submitting visibility switches edited and reloaded.
7. The test published, then closed.
8. Deleting a group that is assigned: the test survives, only the assignment
   goes with it.
9. Deleting the test lands on the list, and the last group is cleaned up.

Groups cannot be renamed anywhere in the admin panel - there is no update
action for them, only create and delete - so no test claims otherwise.

### `placement.spec.ts` - one full drive

1. The admin signs in and sets up their account.
2. The admin imports students from a spreadsheet into a new group.
3. The admin builds a test with all three question types and publishes it.
4. A student signs in, reaches the instructions screen, confirms Continue is
   refused until both checklist items are cleared, checks the camera, agrees to
   the rules, then takes the test under lockdown with the webcam running,
   answers, and submits.
5. The admin sees the score in the rank list.
6. The admin opens the live monitor and the student's webcam thumbnail is
   served as a real JPEG.
7. The admin deletes a throwaway test and lands back on the test list rather
   than on the deleted test's dead URL.
8. The admin opens that student's camera-review page.

### Notes

The suite starts its own server (`npm run build && npm run start`) and uses the
full Chrome-for-Testing build so the Fullscreen API the exam screen depends on
works headlessly. Chromium is launched with a **synthetic webcam**
(`--use-fake-device-for-media-stream`), so the camera gate, frame capture and
upload are exercised for real without hardware. The synthetic feed contains no
face, so face-flag *accuracy* is checked by hand (cover the camera during a dev
run and watch the warning appear after the debounce), not by this suite.

The suite cleans up after earlier runs itself (`e2e/global-setup.ts` removes
only its own E2E/CRUD students, groups and tests), and signs in as the admin
whether or not the first-login change has been made, so it can be run
repeatedly on a development database:

```bash
npm run test:e2e
```

## Load test: 100 students at once

`scripts/load` drives a production server exactly as 100 browsers would, over
HTTP, through the same server actions: everyone opens the test and presses
Continue in the same second, answers every few seconds, uploads a webcam frame
every 15 s and syncs the clock every 20 s for the chosen duration, while an
admin watches the live monitor; then everyone submits in the same second. It
prints latency percentiles and errors per operation, and then checks the
database to confirm the answers, grades and frames were really stored.

```bash
npm run build
npx next start -p 3100                      # in a second terminal
npx tsx scripts/load/setup.mts 100          # 100 LOAD students + a test
npx tsx scripts/load/run.mts http://localhost:3100 90
npx tsx scripts/load/cleanup.mts            # remove them again
```

Result on a laptop (100 students, 90 s): zero errors; opening the test about
2 s, Continue about 1 s, saving an answer 38 ms typical, everyone submitting at
once 0.7 s; 1,068 answers stored and graded, 100 live frames kept.

Playwright's output folders (`test-results/`, `playwright-report/`) are
git-ignored.
