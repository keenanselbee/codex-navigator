import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { codexHome, SessionIndex, writeScopeReport } from './scope-store';
import { sameRoot } from './model';

export async function reportScope(args: string[], home = codexHome(), id = process.env.CODEX_THREAD_ID): Promise<boolean> {
  if (!id || !(await new SessionIndex(home).get(id))) {
    throw new Error('No verified local VS Code conversation identity. Scope was not changed.');
  }
  return writeScopeReport(home, id, exactGitRoots(args));
}

export function exactGitRoots(args: string[]): string[] {
  if (!args.length || args.length > 16) { throw new Error('Pass the primary Git root followed by related roots, or --clear.'); }
  const roots: string[] = [];
  if (!(args.length === 1 && args[0] === '--clear')) {
    for (const directory of args) {
      if (!path.isAbsolute(directory) || /[\r\n\0]/.test(directory)) { throw new Error('Repository paths must be absolute.'); }
      const root = execFileSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 8192, stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (!sameRoot(path.resolve(root), path.resolve(directory))) { throw new Error('Pass an exact Git root, not a directory inside it.'); }
      const normalized = path.normalize(root);
      if (!roots.some(item => sameRoot(item, normalized))) { roots.push(normalized); }
    }
  }
  return roots;
}

if (require.main === module) {
  reportScope(process.argv.slice(2)).then(changed => {
    process.stdout.write(changed ? 'Chat repository scope updated.\n' : 'Chat repository scope unchanged.\n');
  }).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
