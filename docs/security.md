# Security review

A full review of the application, done before the first real placement drive.
Every finding below was confirmed against the code or a running server, and
every one marked **fixed** was re-tested after the fix.

## Fixed

| Severity | Problem | Fix |
| --- | --- | --- |
| Critical | A student could open their own result page in a second tab *while still writing* and see the answer key. | The result page redirects back to the test until the attempt is closed. |
| Critical | The session secret shipped in `.env.example` was in use. Anyone knowing it could sign themselves in as an admin. | The server refuses to start with the example value or anything under 32 characters. The role now comes from the database on every request, never from the cookie. |
| High | Admin pages relied only on the layout's check. A student requesting `/admin/tests/<id>` was redirected, but the response still carried the question text. | Every admin page checks the session itself before reading any data. |
| High | Default passwords were `Test@` plus the end of the roll number, so anyone could sign in as a classmate before they did. | Default and reset passwords are random (`KPRT-4829` style), shown to the admin once. |
| High | No limit on password or security-answer guesses; the date-of-birth question could be brute-forced in minutes. | 8 wrong tries pause the account for 5 minutes (an admin reset lifts it). The date-of-birth question was removed. |
| High | Grading-and-closing an attempt was a public server action anyone could call with any attempt id. | It is no longer exported. Only the checked "submit my own" and admin "end" actions reach it. |
| Medium | A multiple-answer question could be passed by repeating one correct option. | Answers are compared as sets. |
| Medium | Saved answers were not checked against the question or the test. | An answer is stored only for a question on this test, using that question's own options (one option at most for single-answer questions). |
| Medium | The webcam upload accepted any kind and any number of frames. | Only one photo per attempt is accepted now: the frame taken as the test ends, replaced in place, and refused more than two minutes after the attempt closed. Nothing is uploaded during the test. |
| Medium | Logout and password changes did not end other sessions; the first-login screen could change a password without the old one at any time. | Every token carries a session version, bumped on logout and every password change. First-login only works while a change is actually due. |
| Medium | Server actions ignored "must change password". | Actions refuse such accounts until the change is made. |
| Medium | `npm run db:seed` on the lab server would wipe every account. | Seed and reset refuse when submitted tests exist, unless `--force`. |
| Medium | The exam clock started when the page opened, not when the student pressed Continue, and the questions were in the page before the rules were accepted. | The paper is sent, and the clock starts, only on Continue. Time spent on the instructions is capped so it cannot be used to read ahead. |
| Low | Roll numbers could be discovered from wording and response time. | One message for both cases; an unknown roll number costs the same bcrypt time. |
| Low | No security headers. | Content-Security-Policy, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera only), no `X-Powered-By`. |
| Low | The Excel export could be cached. | `Cache-Control: no-store`. |
| Low | Warnings could be counted twice (one alt-tab fires two events) or lost (two arriving together). | Collapsed on the page, and counted atomically in the database. |

## Checked and fine

- All other server actions check the role first and ownership of the attempt.
- The exam page never receives `isCorrect`, accepted answers or explanations.
- The timer, the warning limit and auto-submit are decided on the server.
- No `dangerouslySetInnerHTML`, no raw SQL built from user input, Excel export
  writes plain strings (no formula injection).
- `.env` is git-ignored and has never been committed.
- Cookies are `httpOnly`, `sameSite=lax`, 12 hours; `secure` once
  `SECURE_COOKIES=true` behind HTTPS.
- Next.js checks the `Origin` of every server action (CSRF).

## Known limits (by design)

- **Violations are reported by the browser.** A student who tampers with the
  page's JavaScript could stop reports being sent. The server still enforces
  the clock, the paper and one attempt; the camera frames and the invigilator
  remain the backstop.
- **Alt+Tab and the Windows key cannot be blocked by a web page.** They are
  detected and warned about. Blocking them needs a locked-down exam account on
  the lab PCs.
- **A classmate can pause someone's account for 5 minutes** by typing wrong
  passwords on purpose. It is short by design, and an admin reset lifts it.
