const { readFile, mkdir } = require('node:fs/promises');
const { dirname, join } = require('node:path');
const sharp = require('sharp');

async function generateIcons() {
  const source = dirname(require.resolve('lucide-static/package.json'));
  const destination = join(__dirname, 'assets', 'icons');
  await mkdir(destination, { recursive: true });

  for (const name of [
    'arrow-left',
    'arrow-up-right',
    'arrow-right',
    'eye',
    'eye-off',
    'play',
    'pause',
    'skip-back',
    'skip-forward',
    'x',
    'maximize-2',
    'share-2',
    'headphones',
    'camera',
    'wallet',
  ]) {
    const svg = await readFile(join(source, 'icons', `${name}.svg`));
    await sharp(svg)
      .resize(72, 72)
      .png()
      .toFile(join(destination, `${name}.png`));
  }
}

generateIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
