import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** Content the Activity loads at run time without bundling it, credited by hand. */
const EXTERNAL = `Twemoji graphics
https://github.com/jdecked/twemoji
Copyright 2019 Twitter, Inc and other contributors
Graphics licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/

GIFs: Powered by GIPHY
https://giphy.com

Book data and covers: Open Library
https://openlibrary.org`;

const MARKER = '/node_modules/';

/**
 * Emits licenses.txt next to the Activity: Jensuisla's own license, the license of every package
 * bundled into it (MIT and OFL require shipping their notice, which minification strips) and
 * credits for external content.
 */
export function licenses(): Plugin {
  return {
    name: 'jensuisla-licenses',
    apply: 'build',
    generateBundle() {
      const roots = new Set<string>();
      for (const id of this.getModuleIds()) {
        const root = packageRoot(id);
        if (root) roots.add(root);
      }
      const packages = [...roots].map(describe).sort((a, b) => a.name.localeCompare(b.name));
      const own = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').trim();
      const sections = [
        `Jensuisla\n${own}`,
        `External content\n\n${EXTERNAL}`,
        ...packages.map((p) => `${p.name} ${p.version} (${p.license})\n\n${p.text}`),
      ];
      this.emitFile({ type: 'asset', fileName: 'licenses.txt', source: sections.join(`\n\n${'='.repeat(72)}\n\n`) + '\n' });
    },
  };
}

/** Directory of the npm package a module comes from, or null for the app's own code. */
function packageRoot(id: string): string | null {
  const path = id.split('?')[0]!.replace(/\\/g, '/').replace(/^\0/, '');
  const at = path.lastIndexOf(MARKER);
  if (at < 0) return null;
  const parts = path.slice(at + MARKER.length).split('/');
  const name = parts[0]!.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]!;
  return path.slice(0, at + MARKER.length) + name;
}

function describe(root: string) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name: string; version: string; license?: string };
  const file = readdirSync(root).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  if (!file) throw new Error(`licenses: no license file in ${pkg.name}`);
  return { name: pkg.name, version: pkg.version, license: pkg.license ?? 'see text', text: readFileSync(join(root, file), 'utf8').trim() };
}
