const path = require('path');
const fs = require('fs');

// Resolve symlinks to prevent path mismatches during Android builds
const projectRoot = fs.realpathSync(__dirname);

// Web-only: rewrite `import.meta` → `({})` so libraries that probe
// `import.meta.env.MODE` (e.g. zustand 4.5+) don't throw
// `SyntaxError: Cannot use 'import.meta' outside a module` in the
// Metro-bundled web build (which loads as a classic <script>, not an ES module).
function transformImportMetaToEmpty() {
  return {
    name: 'transform-import-meta-to-empty',
    visitor: {
      MetaProperty(p) {
        if (
          p.node.meta &&
          p.node.meta.name === 'import' &&
          p.node.property &&
          p.node.property.name === 'meta'
        ) {
          p.replaceWithSourceString('({})');
        }
      },
    },
  };
}

module.exports = function (api) {
  const isWeb = api.caller((caller) => caller && caller.platform === 'web');
  api.cache.using(() => isWeb);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: [projectRoot],
          alias: {
            '@': path.join(projectRoot, 'src'),
            '@components': path.join(projectRoot, 'src/components'),
            '@features': path.join(projectRoot, 'src/features'),
            '@stores': path.join(projectRoot, 'src/stores'),
            '@db': path.join(projectRoot, 'src/db'),
            '@services': path.join(projectRoot, 'src/services'),
            '@hooks': path.join(projectRoot, 'src/hooks'),
            '@utils': path.join(projectRoot, 'src/utils'),
          },
        },
      ],
      'react-native-reanimated/plugin',
      ...(isWeb ? [transformImportMetaToEmpty] : []),
    ],
  };
};
