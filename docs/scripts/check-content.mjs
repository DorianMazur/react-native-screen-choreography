import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = path.dirname(docsRoot);
const apiRoot = path.join(docsRoot, 'api');
const runtimeExports = new Set();
const allExports = new Set();
const visited = new Set();

async function readExports(file) {
  if (visited.has(file)) return;
  visited.add(file);

  let source = (await readFile(file, 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const named = /export\s+(type\s+)?\{([^}]+)\}\s+from\s+['"][^'"]+['"]\s*;?/g;
  source = source.replace(named, (_, typeOnly, names) => {
    for (const item of names.split(',')) {
      const specifier = item.trim();
      if (!specifier) continue;

      const match = specifier.match(
        /^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/
      );
      if (!match) {
        throw new Error(`Unsupported export in ${file}: ${specifier}`);
      }
      const name = match[3] || match[2];
      allExports.add(name);
      if (!typeOnly && !match[1]) runtimeExports.add(name);
    }
    return '';
  });

  const inherited = [];
  source = source.replace(
    /export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_, entry) => {
      if (!entry.startsWith('.')) {
        throw new Error(`Cannot inspect external wildcard export: ${entry}`);
      }
      inherited.push(path.resolve(path.dirname(file), `${entry}.ts`));
      return '';
    }
  );

  if (source.trim()) {
    throw new Error(
      `Unsupported entry syntax in ${path.relative(repositoryRoot, file)}. ` +
        'Update this checker when changing the export-only entry convention.'
    );
  }
  for (const entry of inherited) await readExports(entry);
}

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(file)));
    else if (entry.name.endsWith('.md')) files.push(file);
  }
  return files;
}

function apiHeadings(markdown) {
  const names = [];
  let fence;
  for (const line of markdown.split('\n')) {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (
        delimiter[1][0] === fence[0] &&
        delimiter[1].length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }
    if (fence || !/^#{1,6}\s/.test(line)) continue;
    for (const match of line.matchAll(/`([A-Za-z_$][\w$]*)`/g)) {
      names.push(match[1]);
    }
  }
  return names;
}

try {
  const manifest = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')
  );
  const entries = Object.values(manifest.exports)
    .map((entry) => (typeof entry === 'object' ? entry.source : undefined))
    .filter(Boolean);
  if (!entries.length) throw new Error('No public source entries found.');
  for (const entry of entries) {
    await readExports(path.resolve(repositoryRoot, entry));
  }

  const documented = new Set();
  const errors = [];
  const files = await markdownFiles(apiRoot);
  for (const file of files) {
    for (const name of apiHeadings(await readFile(file, 'utf8'))) {
      documented.add(name);
      if (!allExports.has(name)) {
        errors.push(
          `${path.relative(repositoryRoot, file)}: API heading names unexported symbol ${name}.`
        );
      }
    }
  }
  for (const name of [...runtimeExports].sort()) {
    if (!documented.has(name)) {
      errors.push(
        `Missing API reference heading for ${name}. Add a heading such as ## \`${name}\` under docs/api/.`
      );
    }
  }

  if (errors.length) {
    console.error(`Documentation coverage failed:\n${errors.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Documentation coverage passed: ${runtimeExports.size} runtime exports across ${files.length} API pages.`
    );
  }
} catch (error) {
  console.error(`Documentation coverage failed: ${error.message}`);
  process.exitCode = 1;
}
