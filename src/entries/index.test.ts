import path from 'path';
import ts from 'typescript';
import packageJson from '../../package.json';

const entries = {
  core: path.resolve(__dirname, '../..', packageJson.exports['./core'].source),
  reactNavigation: path.resolve(
    __dirname,
    '../..',
    packageJson.exports['.'].source
  ),
  expoRouter: path.resolve(
    __dirname,
    '../..',
    packageJson.exports['./expo-router'].source
  ),
};
const compilerOptions: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  types: [],
};
const program = ts.createProgram(Object.values(entries), compilerOptions);
const checker = program.getTypeChecker();

function getSource(filePath: string) {
  const source = program.getSourceFile(filePath);
  if (!source) throw new Error(`Missing source module: ${filePath}`);
  return source;
}

function getExports(filePath: string) {
  const moduleSymbol = checker.getSymbolAtLocation(getSource(filePath));
  if (!moduleSymbol) throw new Error(`Missing module symbol: ${filePath}`);
  return new Map(
    checker
      .getExportsOfModule(moduleSymbol)
      .map((symbol) => [
        symbol.name,
        symbol.flags === ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol,
      ])
  );
}

function getNavigationDependencies(filePath: string) {
  const visited = new Set<string>();
  const dependencies = new Set<string>();

  function visit(sourcePath: string) {
    if (visited.has(sourcePath)) return;
    visited.add(sourcePath);
    const imports = ts.preProcessFile(getSource(sourcePath).text, true, true);
    for (const { fileName } of imports.importedFiles) {
      if (!fileName.startsWith('.')) {
        dependencies.add(fileName);
        continue;
      }
      const { resolvedModule } = ts.resolveModuleName(
        fileName,
        sourcePath,
        compilerOptions,
        ts.sys
      );
      if (!resolvedModule) {
        throw new Error(`Cannot resolve ${fileName} from ${sourcePath}`);
      }
      visit(resolvedModule.resolvedFileName);
    }
  }

  visit(filePath);
  return [...dependencies]
    .filter(
      (dependency) =>
        dependency.startsWith('@react-navigation/') ||
        dependency === 'expo-router' ||
        dependency.startsWith('expo-router/')
    )
    .sort();
}

describe('Public entry points', () => {
  test.each(Object.entries(entries))(
    '%s contains only exports',
    (_entry, filePath) => {
      const { statements } = getSource(filePath);
      expect(statements.length).toBeGreaterThan(0);
      expect(statements.every(ts.isExportDeclaration)).toBe(true);
    }
  );

  test.each([
    [
      'reactNavigation',
      [
        'ChoreographyScreen',
        'useChoreographyNavigation',
        'useInteractiveTransition',
      ],
    ],
    [
      'expoRouter',
      [
        'ChoreographyScreen',
        'ChoreographyRouterRequest',
        'ExpoRouterLike',
        'useChoreographyRouter',
        'useInteractiveTransition',
      ],
    ],
  ] as const)(
    '%s exports the shared API and its own adapter',
    (entry, adapterExports) => {
      const coreExports = getExports(entries.core);
      const integrationExports = getExports(entries[entry]);
      expect(coreExports.size).toBeGreaterThan(0);
      expect([...integrationExports.keys()].sort()).toEqual(
        [...coreExports.keys(), ...adapterExports].sort()
      );
      for (const [name, symbol] of coreExports) {
        expect(integrationExports.get(name)).toBe(symbol);
      }
    }
  );

  test.each([
    ['core', []],
    ['reactNavigation', ['@react-navigation/native']],
    ['expoRouter', ['expo-router', 'expo-router/react-navigation']],
  ] as const)(
    '%s isolates its navigation dependencies',
    (entry, dependencies) => {
      expect(getNavigationDependencies(entries[entry])).toEqual(dependencies);
    }
  );
});
