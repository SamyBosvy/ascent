import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Read-only lint: minimum readable size, not a markup/styling snapshot test.
const failures = [];
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { scan(path); continue; }
    if (!/\.(tsx|css)$/.test(path) || /\.test\./.test(path)) continue;
    const source = readFileSync(path, 'utf8');
    const minimum = path.endsWith('MobileNavigation.tsx') ? 11 : 12;
    for (const match of source.matchAll(/text-\[(\d*\.?\d+)(px|rem)\]/g)) {
      const px = Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
      if (px < minimum) failures.push(`${path}: ${match[0]} is below ${minimum}px`);
    }
    if (path.endsWith('styles.css')) {
      for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const nav = match[1].includes('.mobile-nav-link');
        for (const size of match[2].matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)/g)) {
          const px = Number(size[1]) * (size[2] === 'rem' ? 16 : 1);
          if (px < (nav ? 11 : 12)) failures.push(`${path}: ${size[0]} is below its minimum`);
        }
      }
    }
  }
}
scan('src/components/app');
scan('src/routes/_authenticated');
scan('src/components/ui');
// The global scale and nav exception are included independently of app markup.
const css = readFileSync('src/styles.css', 'utf8');
for (const size of css.matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)/g)) {
  const px = Number(size[1]) * (size[2] === 'rem' ? 16 : 1);
  if (px < 12 && px !== 11) failures.push(`src/styles.css: ${size[0]} is below 12px`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('Typography minimum check passed: 12px text; 11px bottom navigation.');