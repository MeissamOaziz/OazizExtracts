import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://oaziz.ca';

export default defineConfig({
  site: SITE,
  output: 'static',
  adapter: vercel({
    imageService: true,
    webAnalytics: { enabled: true },
  }),
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'fr',
        locales: { fr: 'fr-CA', en: 'en-CA' },
      },
    }),
  ],
  i18n: {
    defaultLocale: 'fr',
    locales: ['fr', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  image: {
    domains: [],
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
