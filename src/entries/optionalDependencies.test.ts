import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const trayDependencies = [
  '@swmansion/react-native-bottom-sheet',
  'react-native-keyboard-controller',
];

test('tray dependencies are optional peers, never installed as runtime dependencies', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
  );
  for (const dependency of trayDependencies) {
    expect(manifest.peerDependencies[dependency]).toBeDefined();
    expect(manifest.peerDependenciesMeta[dependency]).toEqual({
      optional: true,
    });
    expect(manifest.dependencies?.[dependency]).toBeUndefined();
    expect(manifest.optionalDependencies?.[dependency]).toBeUndefined();
  }
});

test.each(['index', 'core', 'expo-router'])(
  '%s has no transitive imports of tray dependencies',
  (entry) => {
    const visited = new Set<string>();
    const visit = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);
      const source = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
      for (const { fileName } of source.importedFiles) {
        expect(trayDependencies).not.toContain(fileName);
        if (!fileName.startsWith('.')) continue;
        const path = resolve(dirname(file), fileName);
        const imported = ['.ts', '.tsx', '/index.ts', '/index.tsx']
          .map((suffix) => path + suffix)
          .find(existsSync);
        expect(imported).toBeDefined();
        visit(imported!);
      }
    };
    visit(resolve(__dirname, entry + '.ts'));
  }
);
