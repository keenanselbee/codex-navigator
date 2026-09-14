import * as path from 'node:path';
import { accessSync, constants } from 'node:fs';

// Codex owns these binaries. Never fall back to a different architecture or PATH.
export function codexBinary(extensionPath: string | undefined, platform = process.platform, arch = process.arch): string | undefined {
  const system = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : undefined;
  const cpu = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : undefined;
  if (!extensionPath || !system || !cpu) return undefined;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  return paths.join(extensionPath, 'bin', `${system}-${cpu}`, platform === 'win32' ? 'codex.exe' : 'codex');
}

export function codexRuntimeIssue(binary: string | undefined): string {
  if (!binary) return 'Codex Navigator requires the local Codex extension on Windows, macOS or Linux, with x64 or ARM64 architecture.';
  try { accessSync(binary, process.platform === 'win32' ? constants.F_OK : constants.X_OK); }
  catch { return 'The bundled Codex runtime is missing or cannot be executed. Update or reinstall the Codex extension, then restart VS Code.'; }
  return '';
}

export function sameFilePath(left: string, right: string, platform = process.platform): boolean {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const a = paths.resolve(left), b = paths.resolve(right);
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function shellArgument(value: string, platform = process.platform): string {
  if (/[\x00-\x1f\x7f]/.test(value)) throw new Error('Navigator helper paths cannot contain control characters.');
  if (platform === 'win32') {
    // Preserve existing Windows commands, but reject expansion/quote characters
    // whose interpretation differs between Windows command shells.
    if (/["`$%!]/.test(value)) throw new Error('Navigator helper paths contain unsupported Windows shell characters.');
    return `"${value}"`;
  }
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function activityCommand(home: string, platform = process.platform): string {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  return `node ${shellArgument(paths.join(home, 'codex-navigator', 'chat-activity.cjs'), platform)} --home ${shellArgument(home, platform)}`;
}
