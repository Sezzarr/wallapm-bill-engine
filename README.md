# WallaPM Bill Processing Engine

An automated utility bill ingestion and processing pipeline for property managers. Upload EDI files or scanned bills, extract structured data with AI, and match bills to properties — all in one place.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database & Auth | Supabase (Postgres + Row Level Security) |
| Hosting | Vercel |
| OCR / Extraction | Google Gemini Flash |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| EDI Parsing | x12-parser (X12 835 / 810) |

---

## Features

- **EDI Ingestion** — Upload X12 835 (remittance) and 810 (invoice) files; segments are parsed and key fields extracted automatically
- **OCR Pipeline** — Upload a PDF or image of any utility bill; Gemini Flash extracts vendor, amount, billing period, and account number
- **Confidence Scoring** — Each bill receives a 0–100% confidence score based on how many fields were successfully extracted
- **Property Matching** — Bills are matched to properties automatically via account number lookup or fuzzy address similarity; manual override always available
- **Status Lifecycle** — Bills move through `pending → matched → processed` (or `unmatched`), with a full audit log of every transition and timestamp
- **Bill Detail View** — Per-bill page with extracted fields, confidence breakdown, status timeline, and property assignment UI
- **Properties Management** — Create and manage a portfolio of properties; each property stores a name and address used for matching
- **Graceful Error Handling** — Invalid file types, empty files, and unreadable documents are rejected before any database record is created

---

## MCP Usage

This project was built using Model Context Protocol (MCP) servers to accelerate development across infrastructure, deployment, and version control.

### Supabase MCP
Used throughout development to inspect and iterate on the live database without leaving the editor. Key uses:
- Queried table schemas and RLS policies to verify they matched application expectations
- Inspected `bill_status_log` rows in real time while debugging the `matched → processed` transition
- Confirmed that Row Level Security policies were correctly scoping data to the authenticated user before shipping each feature

### Vercel MCP
Used to manage deployment configuration and monitor production state:
- Checked deployment status and build logs after each push to `main`
- Retrieved environment variable names (not values) to verify the production environment was complete
- Inspected function execution logs when diagnosing Gemini API errors in the OCR pipeline

### GitHub MCP
Used to manage the repository and track progress across sessions:
- Created and reviewed commits to maintain a clean history aligned with feature milestones
- Verified remote branch state before rebasing to avoid conflicts
- Inspected recent commit messages to reconstruct context at the start of new sessions

---

## Local Setup

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key (for Gemini Flash)

### Installation

```bash
git clone https://github.com/your-org/wallapm-bill-engine.git
cd wallapm-bill-engine
npm install
```

### Environment Variables

Create a `.env.local` file at the project root with the following variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API |
| `GEMINI_API_KEY` | Google AI Studio → API keys |

### Database Migrations

The schema lives in `supabase/migrations/`. To apply it to your Supabase project, run the migration SQL directly in the Supabase SQL editor, or use the Supabase CLI:

```bash
# Install the CLI if you haven't already
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

The migration creates four tables (`properties`, `bills`, `bill_status_log`, `raw_uploads`) and enables Row Level Security with per-user access policies on all of them.

### Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Create an account on the login page — Supabase Auth handles sign-up and session management automatically.

---

## Deployment

The app is deployed on Vercel. Add the same environment variables from `.env.local` to your Vercel project under **Settings → Environment Variables**, then push to `main`:

```bash
git push origin main
```

Vercel will build and deploy automatically.

---

## Live URL

[https://wallapm-bill-engine.vercel.app](https://wallapm-bill-engine.vercel.app)
