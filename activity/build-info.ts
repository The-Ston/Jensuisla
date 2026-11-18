import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Version shown in the app, injected at build time: the release number from the root
 * package.json and the commit it was built from ("-dirty" when built with uncommitted changes).
 */
export function buildDefines(): Record<string, string> {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit()) };
}

function commit(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== '';
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return 'dev';
  }
}
