const path = require('path');
const { transformFileSync, traverse } = require('@babel/core');

test('the reverse worklet captures a session ID, not frozen React content', () => {
  const { ast } = transformFileSync(
    path.resolve(__dirname, '../src/core/runReverseTransition.ts'),
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
          node.right.properties.map((property) => property.key.name)
        );
      }
    },
  });

  expect(captures).toHaveLength(1);
  expect(captures[0].sort()).toEqual(
    [
      'completeTransition',
      'logSpringSettled',
      'progress',
      'scheduleOnRN',
      'sessionId',
    ].sort()
  );
});
