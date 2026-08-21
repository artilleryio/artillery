// Extract the ensure spec printed by artillery-plugin-inspect-script
// into the CLI output:
//   inspect-script.config.ensure=<base64 of ensure config JSON>
// Returns the substring after the first 'ensure=' on the first matching
// line (bash: grep | awk -F 'ensure=' '{print $2}' | head -n 1), or null.
export function extractEnsureSpec(outputText: string): string | null {
  for (const rawLine of outputText.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.includes('inspect-script.config.ensure')) {
      continue;
    }
    const idx = line.indexOf('ensure=');
    if (idx === -1) {
      return null;
    }
    return line.slice(idx + 'ensure='.length);
  }
  return null;
}
