import { defineConfig } from 'vitepress';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
const repository =
  'https://github.com/DorianMazur/react-native-screen-choreography';
const base = process.env.DOCS_BASE || '/';
const origin = process.env.DOCS_ORIGIN || 'https://screen-choreography.dev';

export default defineConfig({
  title: 'Screen Choreography',
  description:
    'Shared elements. Connected screens. Choreographed transitions for React Native.',
  lang: 'en-US',
  base,
  cleanUrls: false,
  lastUpdated: false,
  srcExclude: ['MAINTAINING.md', 'node_modules/**'],
  sitemap: { hostname: `${origin}${base}` },
  head: [
    [
      'link',
      { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` },
    ],
    ['meta', { name: 'theme-color', content: '#f8f7f4' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Screen Choreography' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Give every screen a sense of connection. Shared element transitions for React Native.',
      },
    ],
  ],
  markdown: {
    theme: {
      light: 'github-light-high-contrast',
      dark: 'github-dark-high-contrast',
    },
    config(md) {
      // Existing contributor docs also render correctly on GitHub. Resolve
      // their out-of-site source links without maintaining a second copy.
      const defaultLink = md.renderer.rules.link_open;
      md.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const token = tokens[index];
        const href = token.attrGet('href');
        if (href && /^\.\.\/(\.github|src|examples|scripts)\//.test(href)) {
          token.attrSet('href', `${repository}/blob/main/${href.slice(3)}`);
        }
        return defaultLink
          ? defaultLink(tokens, index, options, env, self)
          : self.renderToken(tokens, index, options);
      };
    },
  },
  themeConfig: {
    logo: { src: '/favicon.svg', alt: '' },
    siteTitle: 'screen choreography',
    nav: [
      {
        text: 'Documentation',
        link: '/guide/introduction',
        activeMatch: '/(guide|api)/',
      },
      { text: 'Examples', link: '/examples' },
      {
        text: `v${version}`,
        items: [
          {
            text: `Current API · v${version} (pre-1.0)`,
            link: '/guide/introduction#where-it-fits',
          },
          { text: 'Release notes ↗', link: `${repository}/releases` },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: repository, ariaLabel: 'View source on GitHub' },
    ],
    search: { provider: 'local' },
    sidebar: [
      {
        text: 'START HERE',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Your first transition', link: '/guide/quick-start' },
          { text: 'Expo Router', link: '/guide/expo-router' },
        ],
      },
      {
        text: 'BUILD WITH MOTION',
        items: [
          { text: 'Transition recipes', link: '/guide/transitions' },
          { text: 'Interactive Back', link: '/guide/interactive-back' },
          { text: 'Readiness & loading', link: '/guide/readiness' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: 'API REFERENCE',
        items: [
          { text: 'Components', link: '/api/components' },
          { text: 'Navigation', link: '/api/navigation' },
          { text: 'Transitions', link: '/api/transitions' },
          { text: 'Hooks & utilities', link: '/api/hooks' },
        ],
      },
      {
        text: 'GO DEEPER',
        items: [
          { text: 'Example apps', link: '/examples' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Performance', link: '/performance' },
        ],
      },
    ],
    outline: { level: [2, 3], label: 'On this page' },
    editLink: {
      pattern: `${repository}/edit/main/docs/:path`,
      text: 'Improve this page on GitHub',
    },
    lastUpdated: { text: 'Updated', formatOptions: { dateStyle: 'medium' } },
    docFooter: { prev: 'Previous', next: 'Up next' },
    footer: {
      message: 'Made for the moments between screens.',
      copyright: 'MIT licensed · Built by Dorian Mazur and contributors',
    },
  },
});
