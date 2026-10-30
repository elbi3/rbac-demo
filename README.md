# RBAC Test Bench

Authentication and role-based access control (RBAC) demo, built with AI co-piloting and then audited and tested against a security checklist.

**Live demo:** https://rbac-demo.ellbi3.workers.dev/  
**Video walkthrough:** TODO: add link
**Author:** El Brewster



## 1. Overview

Users can register, log in, and log out. There are two roles, `user` and `admin`, and three kinds of endpoints:

| Endpoint | Access | Result for others |
|---|---|---|
| `GET /api/public` | Anyone | n/a |
| `GET /api/me` | Any logged-in user | `401` if logged out |
| `GET /api/admin/users` | Admin only | `401` if logged out, `403` if a regular user |

The frontend is a small test bench: forms for registering and logging in, buttons for calling each endpoint, and a response log showing every status code. The buttons are intentionally always enabled, because access is decided by the server, not the UI.

**Tech stack**

- **Frontend:** Vue 3 + Vite
- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Auth:** PBKDF2-SHA256 password hashing (Web Crypto) and a signed JWT (HS256) in an `HttpOnly` cookie
- **Hosting/tooling:** Cloudflare Workers, Wrangler, `@cloudflare/vite-plugin`

**Project layout**

```
src/worker/index.ts   API, password hashing, JWT, route guards
src/app/App.vue       Test bench UI
schema.sql            users table
qa.mjs                Automated QA script
wrangler.jsonc        Cloudflare config
```

## 2. Setup & Execution Guide

**Prerequisites:** a recent Node.js (20 or newer) and a free Cloudflare account (only needed for deploying).

1. **Clone and install**

   ```
   git clone <this-repo-url>
   cd rbac-demo
   npm install
   ```

   If `npm install` reports missing packages, run:

   ```
   npm i vue hono
   npm i -D vite @vitejs/plugin-vue @cloudflare/vite-plugin wrangler typescript @cloudflare/workers-types
   ```

2. **Create the local secrets file.** The repo does not include `.dev.vars` (it is gitignored). Create it in the project root:

   ```
   JWT_SECRET=replace-with-a-long-random-string-of-32-or-more-characters
   ```

   One way to generate a value: `openssl rand -base64 48`.

3. **Create the local database table**

   ```
   npm run db:local
   ```

4. **Start the app** and open http://localhost:5173

   ```
   npm run dev
   ```

5. **Create an admin.** Registration always creates a regular `user` (by design). Register an account in the browser, then promote it:

   ```
   npx wrangler d1 execute rbac-demo --local --command "UPDATE users SET role='admin' WHERE username='YOUR_USERNAME'"
   ```

6. **Run the automated QA script** in a second terminal while the dev server is running. `ADMIN_USER` and `ADMIN_PASS` are the login details of the admin account from step 5:

   ```
   ADMIN_USER=YOUR_USERNAME ADMIN_PASS='your-password' npm run qa
   ```

   (Mac/Linux/Git Bash syntax. In PowerShell, set `$env:ADMIN_USER` and `$env:ADMIN_PASS` on separate lines first.) To test a deployed site, add `BASE_URL=https://your-url`.

### Deploying your own copy

```
npx wrangler login
npx wrangler d1 create rbac-demo       # paste the printed database_id into wrangler.jsonc
npm run db:remote                      # creates the users table in the live database
npx wrangler secret put JWT_SECRET     # use a different long random value than your local one
npm run deploy
```

Promote the live admin with the same `UPDATE` command, adding `--remote`.

## 3. AI Disclosure & Prompt Appendix

**AI tool used:** Claude (Anthropic), via the claude.ai chat interface. It produced the initial application, and I used it for explanations and troubleshooting while testing and deploying.

### Prompts submitted

My first message, which included the full assignment text:

> Can you help me with my class assignment? This is the whole prompt (so long!)
> It is titled 'Assignment: Implementing Authentication & Role-Based Access Control (RBAC) with AI Co-Piloting'

I did not use the assignment's sample prompt word for word. I pasted the assignment and asked for help, and the AI offered a choice of stack. My stack request:

> We can do Node/Express, but I would rather do the Vue.js ecosystem with Void0 &/or Cloudflare, whatever makes sense

The AI built the project in response to that. After checking what Void was, it chose Cloudflare Workers with Hono and D1 instead, because Void was very new and deploys to Workers anyway.

Later prompts, in summary (the complete conversation is the full log):

- Asked how to run the QA command, whether it runs in the terminal, and how to use the site for each assignment point.
- Fixed my admin account setup (I had not understood that `ADMIN_USER` and `ADMIN_PASS` are login details, not setup commands).
- Asked what several TypeScript and Vue constructs mean, and about two TypeScript errors.
- Asked how to deploy to Cloudflare, how to fix a `d1 create` authentication error (code 10000), and what a deploy warning meant.
- Asked about Cloudflare costs and free-plan limits, how to link the demo from my Astro site, and whether my username in the URL was a risk.
- Asked what to check before pushing to GitHub and what else to double-check for security.


### What the AI got right

- Passwords are hashed with a slow, salted algorithm (PBKDF2-SHA256, random 16-byte salt, 100,000 iterations) and compared in constant time. Plaintext, MD5, and SHA-256 were not used.
- The admin check is enforced on the server (`requireAdmin` returns `403`), and `requireAuth` returns `401`. It was not only hidden in the UI.
- The user's role is read from the database on every request, not trusted from the token.
- Registration ignores any `role` sent by the client, so users cannot make themselves admin.
- Login failures return the same generic message whether the username or the password was wrong, and the same hashing work happens either way.
- The JWT secret comes from environment configuration (`.dev.vars` locally, a Wrangler secret in production), not from the source code.
- Password hashes are never returned in responses.
- Database queries are parameterized, so SQL-like input does not alter queries.
- The token is stored in an `HttpOnly`, `SameSite=Strict` cookie (also `Secure` over HTTPS) that expires after one hour.

### What needed manual patching or is still missing

| Issue | Status |
|---|---|
| TypeScript error: `Uint8Array` not assignable to `BufferSource` | Fixed by typing the salt as `Uint8Array<ArrayBuffer>` |
| TypeScript error: `timingSafeEqual` does not exist on `SubtleCrypto` (it is a Cloudflare extension) | Resolved with a type cast on that call. It runs correctly in Workers |
| Setup instructions were unclear: `ADMIN_USER`/`ADMIN_PASS` and the `'...'` placeholder were easy to misread | Clarified during testing |
| No password or username rules shown on the form, only in the error message after submitting | Not yet fixed |
| Empty-field validation exists on the server only, with no client-side check | Not yet fixed (see QA summary) |
| Logout only clears the cookie. A copied token stays valid until it expires (stateless JWT) | Known limitation. A fix would need token revocation |
| No rate limiting on login or registration | Known limitation |
| UI shows "Signed out" after a page refresh even though the cookie is still valid | Known limitation |
| Registering an existing username returns a distinct `409`, a small enumeration signal | Accepted trade-off |
| PBKDF2 instead of bcrypt/Argon2 | Accepted. PBKDF2 is allowed by the assignment, and bcrypt does not run well in Workers |
| Deploy warnings about `workers_dev` and `preview_urls` | Set both explicitly in `wrangler.jsonc` |

## 4. QA Test Summary

Results from manual testing in the browser (local and live) and from `npm run qa` (`qa.mjs`, run locally and against the live site).

**Tested on:** TODO: date

### 1. Authentication functional tests

- [x] Successful registration with a new account. Result: `201`. *(manual + automated)*
- [x] Successful login generating an active token. Result: `200`, `token` cookie set (HttpOnly, Secure on the live site). *(manual + automated)*
- [x] Failed login with an invalid password shows a generic error. Result: `401 Invalid username or password`, identical for unknown users. *(manual + automated)*
- [x] Logout removes the credential. Result: cookie removed, `/api/me` returns `401` afterward. *(manual)*

### 2. Authorization and privilege boundary tests

- [x] Standard user can access the User dashboard. Result: `200`. *(manual + automated)*
- [x] Standard user attempting the Admin endpoint gets a clean `403`. *(manual + automated)*
- [x] Admin can access both User and Admin resources. Result: `200` on both. *(manual + automated)*
- [x] Logged-out access to protected endpoints returns `401`. Also tested: a forged token returns `401`, and registering with `role: admin` does not produce an admin. *(manual + automated)*

### 3. Input validation and edge cases

- [x] Empty username/password rejected by the server. Result: `400`. *(manual + automated)*
- [ ] Empty username/password rejected by the client. **Not implemented**: only server-side validation exists.
- [x] Special characters and SQL-like syntax do not crash the server. Result: `401` on login, `400` on registration, no `500`. Malformed JSON also does not crash it. *(manual + automated)*

### 4. Browser console and network health

- [x] DevTools Network tab shows proper status codes (`200`, `201`, `400`, `401`, `403`). *(manual)*
- [x] Console has no unhandled JavaScript exceptions. The only red lines are the browser's "Failed to load resource" messages for the intentional `4xx` test requests. *(manual)*

### Automated results (`npm run qa`)

16 checks: registration, generic login errors, token cookie, no password hash in responses, user access, `403` for non-admins, `401` when logged out, forged token, no self-promotion to admin, empty credentials, SQL-like input, malformed JSON, and the two admin access checks. TODO: confirm the final run, e.g. "16 passed, 0 failed", against the live URL.