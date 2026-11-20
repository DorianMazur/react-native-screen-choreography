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
  description: 'Multi-step native tray navigation for React Native.',
  lang: 'en-US',
  base,
  cleanUrls: false,
  appearance: 'dark',
  lastUpdated: false,
  srcExclude: ['MAINTAINING.md', 'node_modules/**'],
  sitemap: { hostname: `${origin}${base}` },
  head: [
    [
      'link',
      { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` },
    ],
    ['meta', { name: 'theme-color', content: '#101211' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Screen Choreography' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Build multi-step flows in a resizing native bottom sheet.',
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
      { text: 'Guide', link: '/guide/dynamic-trays' },
      { text: 'Examples', link: '/examples' },
      { text: `v${version}`, link: `${repository}/releases` },
    ],
    socialLinks: [{ icon: 'github', link: repository }],
    search: { provider: 'local' },
    sidebar: [
      { text: 'Installation', link: '/guide/installation' },
      { text: 'Build a tray', link: '/guide/dynamic-trays' },
      { text: 'API reference', link: '/api/tray' },
      { text: 'Examples', link: '/examples' },
      { text: 'Architecture', link: '/architecture' },
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
