const path = require('path');
const fs = require('fs');

// Resolve symlinks to prevent path mismatches during Android builds
const projectRoot = fs.realpathSync(__dirname);

module.exports = function (api) {
  api.cache(true);
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
    ],
  };
};
