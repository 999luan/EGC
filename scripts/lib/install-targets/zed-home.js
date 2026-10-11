const os = require('node:os');
const path = require('node:path');

const {
  createFlatSkillPlanOperations,
  createInstallTargetAdapter,
} = require('./helpers');

function resolveSharedAgentsRoot(input) {
  const home = typeof input === 'string' ? input : input?.homeDir;
  return path.join(home || os.homedir(), '.agents');
}

// Zed reads personal instructions (AGENTS.md) from ~/.config/zed/AGENTS.md
// on Linux and macOS, and from %APPDATA%\Zed\AGENTS.md on Windows
// (https://zed.dev/docs/ai/instructions). %APPDATA% belongs to the account
// running EGC, so it only applies when the install targets that account's
// own home; a sandboxed or redirected home gets AppData\Roaming under itself.
function resolveZedConfigRoot(input = {}, options = {}) {
  const home = typeof input === 'string' ? input : (input?.homeDir || os.homedir());
  const platform = options.platform || (typeof input === 'object' && input?.platform) || process.platform;
  const env = options.env || (typeof input === 'object' && input?.env) || process.env;
  if (platform !== 'win32') {
    return path.join(home, '.config', 'zed');
  }
  const appData = typeof env.APPDATA === 'string' && env.APPDATA.length > 0 ? env.APPDATA : '';
  const isOwnHome = path.resolve(home) === path.resolve(os.homedir());
  return path.join(appData && isOwnHome ? appData : path.join(home, 'AppData', 'Roaming'), 'Zed');
}

const baseAdapter = createInstallTargetAdapter({
  id: 'zed-home',
  target: 'zed',
  kind: 'home',
  rootSegments: ['.config', 'zed'],
  installStatePathSegments: ['egc', 'install-state.json'],
  nativeRootRelativePath: '.zed',
  resolveRoot(input = {}) {
    return resolveZedConfigRoot(input);
  },
  resolveManagedRoots(input, adapter) {
    return [adapter.resolveRoot(input), resolveSharedAgentsRoot(input)];
  },
  planOperations(input, adapter) {
    return createFlatSkillPlanOperations(input, adapter, {
      skillsDir: planningInput => path.join(resolveSharedAgentsRoot(planningInput), 'skills'),
    });
  },
});

module.exports = Object.freeze({
  ...baseAdapter,
  resolveZedConfigRoot,
});
