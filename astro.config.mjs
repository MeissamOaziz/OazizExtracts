import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://oaziz.ca';

export default defineConfig({
  site: SITE,
  output: 'static',
  // Vercel's apex→www 307 redirect preserves POST bodies but keeps the
  // original Origin header (`oaziz.ca`) while the request lands at
  // `www.oaziz.ca`. Astro's default CSRF check then treats it as cross-site
  // and rejects legitimate form POSTs. Disabled — we still get same-origin
  // protection from browsers via SameSite=Lax cookies on the auth session.
  security: {
    checkOrigin: false,
  },
  adapter: vercel({
    imageService: true,
    webAnalytics: { enabled: true },
  }),
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en-CA', fr: 'fr-CA' },
      },
    }),
  ],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    routing: { prefixDefaultLocale: false },
  },
  image: {
    domains: [],
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
