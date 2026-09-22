import * as fs from 'fs';
import * as hbs from 'hbs';
import * as path from 'path';

/**
 * Register every `.hbs` under `viewsRoot` using its path relative to that root
 * (e.g. `search/results`, `resources/summary-thesis`) so nested `{{> …}}`
 * names resolve the same in Nest bootstrap and e2e.
 */
export function registerViewPartials(viewsRoot: string): void {
  walk(viewsRoot, viewsRoot);
}

function walk(dir: string, viewsRoot: string): void {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, viewsRoot);
      continue;
    }
    if (!entry.name.endsWith('.hbs')) {
      continue;
    }
    const relative = path
      .relative(viewsRoot, absolute)
      .replace(/\\/g, '/')
      .replace(/\.hbs$/, '');
    // Skip top-level page templates that are rendered by name (home, account, …)
    // but keep layouts/, partials/, nested fragments used via {{> …}}.
    if (!relative.includes('/')) {
      continue;
    }
    hbs.registerPartial(relative, fs.readFileSync(absolute, 'utf8'));
  }
}
