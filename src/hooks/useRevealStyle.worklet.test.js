const path = require('path');
const { transformFileSync, traverse } = require('@babel/core');

test('reveal animation compiles to a worklet without capturing React contexts or recipe objects', () => {
  const { ast } = transformFileSync(
    path.resolve(__dirname, 'useRevealStyle.ts'),
    {
      configFile: false,
      babelrc: false,
      ast: true,
      plugins: [
        '@babel/plugin-transform-typescript',
        'react-native-worklets/plugin',
      ],
    }
  );
  const captures = [];
  traverse(ast, {
    AssignmentExpression({ node }) {
      if (
        node.left.type === 'MemberExpression' &&
        node.left.property.name === '__closure' &&
        node.right.type === 'ObjectExpression'
      ) {
        captures.push(
          ...node.right.properties.map((property) => property.key.name)
        );
      }
    },
  });
  expect(captures).toContain('progress');
  for (const jsOnly of [
    'controls',
    'state',
    'presentation',
    'recipe',
    'resolved',
  ]) {
    expect(captures).not.toContain(jsOnly);
  }
});
