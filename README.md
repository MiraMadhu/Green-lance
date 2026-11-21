# GreenLance — pay-once freelancer & client marketplace

Green / navy / white themed, full-stack (Node.js + Express + SQLite), server-rendered for SEO.

## How the business model works
| Step | What happens |
|---|---|
| Sign up | Freelancer or client. Email + strong password, or Google. |
| Free start | **2 free contacts** per user (both sides). |
| After 2 | User pays a **one-time unlock** (₹499, includes 10 credits). |
| Then | **1 credit = 1 new contact.** Buy packs: 10 / 30 / 100 credits. |
| Contacting | Clients post requirements → freelancers contact clients. Clients browse freelancer profiles → contact freelancers. The person contacted sees the message and the sender's details **for free**. |

Change prices, free-contact count and categories in `config.js`.

## Run locally
```bash
npm install
cp .env.example .env      # optional
npm start                 # http://localhost:3000
```
Without Razorpay keys, payments run in **demo mode** (simulated success, dev only).

## Deploy (Render, ~10 minutes)
1. Create a GitHub account → new **private** repo → upload this folder (or `git init && git push`).
2. Go to render.com → **New → Blueprint** → pick the repo. It reads `render.yaml`.
3. Fill the environment variables it asks for:
   - `BASE_URL` = your final URL, e.g. `https://greenlance.onrender.com` (no trailing slash)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` (strong password) → gives you `/admin`
   - Google + Razorpay values (steps below; can be added later)
4. Deploy. Open the URL. `/healthz` should say `ok`.

> **Database note:** SQLite lives on the 1 GB persistent disk at `/data` (needs Render's paid *Starter* plan). Free plans wipe the disk on every deploy, which would delete users. Railway and Fly.io volumes work the same way with the included Dockerfile.

### Custom domain
Render → Service → Settings → Custom Domains. Then update `BASE_URL` to the domain and redeploy (sitemap, canonical tags and Google redirect use it).

## 3. Google sign-in
1. console.cloud.google.com → create project → **APIs & Services → OAuth consent screen** (External, add your app name/email).
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. Authorized redirect URI: `https://YOUR-DOMAIN/auth/google/callback` (and `http://localhost:3000/auth/google/callback` for local).
4. Copy Client ID / Secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Publish the consent screen to production when ready.

## 4. Razorpay payments
1. razorpay.com → create account → complete KYC for live mode (test mode works immediately).
2. Settings → API Keys → generate. Put them in `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
3. Payments are verified server-side with the HMAC signature before any credits are granted.

## 5. Get on Google (SEO checklist)
Already built in: unique titles/meta descriptions, canonical URLs, Open Graph + Twitter cards, JSON-LD (Organization, WebSite+SearchAction, FAQPage, Person/ProfilePage), `/sitemap.xml` (auto-includes every profile and open project), `/robots.txt`, semantic HTML, mobile-first responsive layout, gzip, caching headers, `noindex` on search/filter pages and dashboards.

You do:
1. search.google.com/search-console → **Add property** (URL prefix) → verify (DNS TXT record is easiest on a custom domain).
2. **Sitemaps → submit** `https://YOUR-DOMAIN/sitemap.xml`.
3. **URL Inspection → Request indexing** for `/`, `/pricing`, `/freelancers`, `/projects`.
4. Seed real content: ask 10–20 freelancers to complete profiles and post a few real projects — Google ranks pages with real content.
5. Share profile links on LinkedIn/WhatsApp/X for first backlinks; add a Google Business Profile if you have an office.

## Security built in
bcrypt (cost 12) hashing · password rules (8–72 chars, upper, lower, number, special) · JWT in httpOnly + SameSite cookie (Secure in production) · role-based authorization on every API · rate limiting on auth and API · Helmet security headers + CSP · JSON-only API with origin check (CSRF) · all output HTML-escaped · parameterised SQL · server-side payment signature verification · atomic transactions for free/credit accounting.

## Project layout
```
server.js   routes, auth, payments, SEO files
views.js    server-rendered pages + SEO tags
config.js   pricing, limits, categories, env
db.js       SQLite schema
public/     css, js, images
```

## Before you launch — you should add
Terms of Service, Privacy Policy and Refund Policy pages (Razorpay requires them for live mode); email verification / password reset (needs an email provider such as Resend or Brevo); and regular backups of `/data/app.db`.
