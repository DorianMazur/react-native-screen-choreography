const path = require('path');
const { transformFileSync, traverse } = require('@babel/core');

test.each(['useInteractiveGestureLifecycle.ts', 'useInteractiveTransition.ts'])(
  '%s does not transfer JS lifecycle objects into worklets',
  (file) => {
    const { ast } = transformFileSync(path.resolve(__dirname, file), {
      configFile: false,
      babelrc: false,
      ast: true,
      plugins: [
        '@babel/plugin-transform-typescript',
        'react-native-worklets/plugin',
      ],
    });
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
    expect(captures.length).toBeGreaterThan(0);
    for (const jsOnly of [
      'scope',
      'controller',
      'request',
      'handle',
      'latest',
      'signal',
      'progressOwnership',
      'animateSettlement',
    ]) {
      expect(captures).not.toContain(jsOnly);
    }
  }
);
