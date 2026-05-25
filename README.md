# Oaziz Extracts — oaziz.ca

Production website for **Oaziz Extracts Inc.**, a Montreal-based solvent-free cannabis extraction company.

Built with [Astro](https://astro.build) and hosted on [Vercel](https://vercel.com). Contact form delivers via [Resend](https://resend.com).

## Local development

```bash
npm install
npm run dev          # http://localhost:4321
```

## Build

```bash
npm run build        # output to ./dist
npm run preview      # serve the built site locally
```

## Deployment

- Pushes to `main` deploy to production at https://oaziz.ca (via Vercel).
- Every other branch / PR gets a preview URL.

## Environment variables

Set in the Vercel dashboard (Project → Settings → Environment Variables):

| Name | Where | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Production + Preview | Auth for the Resend transactional email API used by `/api/contact` |
| `CONTACT_TO_EMAIL` | Production + Preview | Inbox that receives contact-form submissions |
| `CONTACT_FROM_EMAIL` | Production + Preview | Verified sender (`noreply@oaziz.ca` once Resend domain is verified; `onboarding@resend.dev` as fallback) |

## Project layout

```
src/
  components/   # Header, Footer, BottomBanner, ContactForm, etc.
  layouts/      # Layout wrappers
  pages/
    index.astro       # French homepage (default locale)
    en/index.astro    # English homepage
    ...
  styles/       # Global CSS
  i18n/         # Translation tables
public/         # Static assets (favicon, images served as-is)
_legacy/        # Pre-migration raw-HTML site (kept for reference; not built)
```

## i18n

- Default locale: `fr` (no URL prefix — `/`, `/about`, `/hash`)
- Secondary locale: `en` (prefixed — `/en`, `/en/about`, `/en/hash`)
- Translation strings live in `src/i18n/ui.ts`. Page content uses Astro's content collections per locale.

## Legacy site

The original raw-HTML site that ran on GitHub Pages is preserved under `_legacy/` and is excluded from the Astro build. Reference only — do not edit.
