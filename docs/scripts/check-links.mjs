import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputRoot = fileURLToPath(
  new URL('../.vitepress/dist/', import.meta.url)
);
const origin = 'https://documentation.invalid';
const base = process.env.DOCS_BASE || '/';

function decodeEntities(value) {
  const named = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: '\u00a0',
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
    (_, entity) => {
      if (entity[0] !== '#') return named[entity.toLowerCase()];
      const hexadecimal = entity[1].toLowerCase() === 'x';
      const point = Number.parseInt(
        entity.slice(hexadecimal ? 2 : 1),
        hexadecimal ? 16 : 10
      );
      return point > 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : '\ufffd';
    }
  );
}

async function outputFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await outputFiles(file)));
    else if (entry.isFile()) {
      files.push(path.relative(outputRoot, file).split(path.sep).join('/'));
    }
  }
  return files;
}

function readPage(html) {
  const ids = new Set();
  const links = [];
  // This reads VitePress's generated, quoted HTML attributes. Omit comments and
  // script/style contents so examples and serialized data cannot create links.
  const markup = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  for (const tag of markup.matchAll(
    /<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi
  )) {
    for (const attribute of tag[2].matchAll(
      /\s([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
    )) {
      if (attribute[2] === undefined && attribute[3] === undefined) continue;
      const value = decodeEntities(attribute[2] ?? attribute[3]);
      if (attribute[1].toLowerCase() === 'id') ids.add(value);
      else if (
        tag[1].toLowerCase() === 'a' &&
        attribute[1].toLowerCase() === 'href'
      ) {
        links.push(value);
      }
    }
  }
  return { ids, links };
}

function pageUrl(file) {
  // Match static HTML URLs. An index page keeps its directory's
  // trailing slash, which matters when resolving relative links.
  const route = file.replace(/(^|\/)index\.html$/, '$1');
  return new URL(
    base + route.split('/').map(encodeURIComponent).join('/'),
    origin
  );
}

try {
  if (
    !base.startsWith('/') ||
    base.startsWith('//') ||
    !base.endsWith('/') ||
    /[?#]/.test(base)
  ) {
    throw new Error(
      'DOCS_BASE must be a path with leading and trailing slashes.'
    );
  }
  const basePath = decodeURIComponent(new URL(base, origin).pathname);
  const files = new Set(await outputFiles(outputRoot));
  const pages = new Map();
  for (const file of files) {
    if (file.endsWith('.html')) {
      pages.set(
        file,
        readPage(await readFile(path.join(outputRoot, file), 'utf8'))
      );
    }
  }
  if (!pages.size)
    throw new Error('No generated HTML found. Build the site first.');

  const errors = new Set();
  let checked = 0;
  for (const [file, page] of pages) {
    for (const href of page.links) {
      try {
        const target = new URL(href, pageUrl(file));
        if (target.origin !== origin) continue;
        checked += 1;
        const pathname = decodeURIComponent(target.pathname);
        if (
          !pathname.startsWith(basePath) &&
          pathname !== basePath.slice(0, -1)
        ) {
          errors.add(`${file}: ${href} is outside DOCS_BASE (${base}).`);
          continue;
        }
        let route = path.posix.normalize(pathname.slice(basePath.length));
        if (route === '.') route = '';
        if (
          route === '..' ||
          route.startsWith('../') ||
          route.startsWith('/')
        ) {
          errors.add(`${file}: ${href} resolves outside the generated site.`);
          continue;
        }
        const candidates =
          !route || route.endsWith('/')
            ? [`${route}index.html`]
            : [route, `${route}/index.html`];
        const destination = candidates.find((candidate) =>
          files.has(candidate)
        );
        if (!destination) {
          errors.add(`${file}: ${href} has no generated page or local asset.`);
          continue;
        }
        const fragment = decodeURIComponent(target.hash.slice(1)).split(
          ':~:'
        )[0];
        if (
          fragment &&
          pages.has(destination) &&
          !pages.get(destination).ids.has(fragment)
        ) {
          errors.add(`${file}: ${href} has no matching id in ${destination}.`);
        }
      } catch (error) {
        errors.add(`${file}: ${href} is invalid (${error.message}).`);
      }
    }
  }

  if (errors.size) {
    console.error(
      `Generated link check failed:\n${[...errors].sort().join('\n')}`
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Generated link check passed: ${checked} local links across ${pages.size} HTML pages.`
    );
  }
} catch (error) {
  console.error(`Generated link check failed: ${error.message}`);
  process.exitCode = 1;
}
