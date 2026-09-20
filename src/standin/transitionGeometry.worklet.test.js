const path = require('path');
const {
  transformFileSync,
  transformFromAstSync,
  traverse,
} = require('@babel/core');

test('geometry interpolation compiles as a standalone UI worklet without runtime captures', () => {
  const { ast: surfaceAst } = transformFileSync(
    path.resolve(__dirname, 'TransitionSurface.tsx'),
    {
      configFile: false,
      babelrc: false,
      ast: true,
      plugins: [['@babel/plugin-transform-typescript', { isTSX: true }]],
    }
  );
  // Compile only the geometry helper; component worklets capture props by design.
  surfaceAst.program.body = surfaceAst.program.body.filter(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.id?.name === 'transitionGeometryStyle'
  );
  const { ast } = transformFromAstSync(surfaceAst, undefined, {
    filename: path.resolve(__dirname, 'TransitionSurface.tsx'),
    configFile: false,
    babelrc: false,
    ast: true,
    plugins: ['react-native-worklets/plugin'],
  });
  const captures = [];
  let worklets = 0;
  traverse(ast, {
    AssignmentExpression({ node }) {
      if (node.left.type !== 'MemberExpression') return;
      if (node.left.property.name === '__workletHash') worklets += 1;
      if (
        node.left.property.name === '__closure' &&
        node.right.type === 'ObjectExpression'
      ) {
        captures.push(
          ...node.right.properties.map((property) => property.key.name)
        );
      }
    },
  });
  expect(worklets).toBeGreaterThan(0);
  expect(captures).toEqual([]);
});
