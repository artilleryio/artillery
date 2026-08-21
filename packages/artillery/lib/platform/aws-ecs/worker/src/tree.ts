import fs from 'node:fs';
import path from 'node:path';

// Recursive directory listing approximating `tree -I <exclude>`:
// dotfiles hidden, excluded names skipped, summary line at the end.
// Output is informational only.
export function renderTree(dir: string, exclude: string[] = []): string {
  const lines: string[] = ['.'];
  let dirCount = 0;
  let fileCount = 0;

  const walk = (currentDir: string, prefix: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    const visible = entries
      .filter((e) => !e.name.startsWith('.') && !exclude.includes(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    visible.forEach((entry, i) => {
      const last = i === visible.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${entry.name}`);
      if (entry.isDirectory()) {
        dirCount++;
        walk(path.join(currentDir, entry.name), prefix + (last ? '    ' : '│   '));
      } else {
        fileCount++;
      }
    });
  };

  walk(dir, '');
  lines.push('', `${dirCount} directories, ${fileCount} files`);
  return lines.join('\n');
}
