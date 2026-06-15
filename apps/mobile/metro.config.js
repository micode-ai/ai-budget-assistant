// Prevent Expo from using monorepo root as Metro server root.
// Without this, Metro resolves entry files from the workspace root instead of apps/mobile.
process.env.EXPO_NO_METRO_WORKSPACE_ROOT = '1';

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Let Metro know where to resolve packages (hoisted to root with npm workspaces)
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules'),
];

// --- Metro file-map crawl scoping (Windows monorepo, no Watchman) ---
// Watchman publishes no Windows builds, so Metro falls back to its JS Node
// crawler, which walks every watchFolder on each cold start. Because
// watchFolders is the whole workspaceRoot, that crawl includes apps/api
// (NestJS + Prisma + its own node_modules) and apps/admin (Next.js + its own
// node_modules) plus the @budget/* workspace symlinks — none of which the
// mobile bundle needs. As those apps grew, the crawl stopped finishing within
// Metro's startup budget and bundling hung before it could even start.
// blockList is the file-map ignorePattern (see metro createFileMap.js) and the
// Node crawler applies it at directory level (skips the whole subtree before
// recursing into it), so excluding the unrelated apps keeps the crawl to
// apps/mobile + root node_modules + packages/shared-*. shared-types/shared-utils
// are intentionally NOT excluded — the mobile app imports them.
const defaultBlockList = config.resolver.blockList;
const baseExclusions = Array.isArray(defaultBlockList)
  ? defaultBlockList.filter(Boolean)
  : defaultBlockList
    ? [defaultBlockList]
    : [];
const extraExclusions = [
  /[\\/]apps[\\/](api|admin)[\\/]/,
  /[\\/]node_modules[\\/]@budget[\\/](api|mobile)[\\/]/,
  /[\\/]node_modules[\\/]admin[\\/]/,
];
config.resolver.blockList = new RegExp(
  [...baseExclusions, ...extraExclusions].map((re) => `(${re.source})`).join('|'),
  baseExclusions[0] ? baseExclusions[0].flags : '',
);

module.exports = config;
