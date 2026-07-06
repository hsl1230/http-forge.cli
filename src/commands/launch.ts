import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function parseShellKind(): 'powershell' | 'cmd' | 'bash' | 'sh' | 'unknown' {
  if (process.platform === 'win32') {
    const comspec = (process.env.ComSpec || process.env.COMSPEC || '').toLowerCase();
    const ps = (process.env.PSModulePath || '').toLowerCase();
    if (comspec.includes('powershell') || ps.length > 0) return 'powershell';
    return 'cmd';
  }

  const shell = (process.env.SHELL || '').toLowerCase();
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('zsh') || shell.includes('ksh') || shell.includes('dash')) return 'sh';
  if (shell.includes('/sh')) return 'sh';
  return 'unknown';
}

function resolveLauncherScript(): { scriptPath: string; platform: 'win32' | 'unix' } {
  const root = path.resolve(__dirname, '..', '..');
  const isWindows = process.platform === 'win32';
  const scriptPath = isWindows
    ? path.join(root, 'scripts', 'http-forge.bat')
    : path.join(root, 'scripts', 'http-forge.sh');

  if (!existsSync(scriptPath)) {
    throw new Error(
      `Launcher script not found: ${scriptPath}. Reinstall @http-forge/cli or ensure scripts are packaged.`
    );
  }

  return { scriptPath, platform: isWindows ? 'win32' : 'unix' };
}

function quoteForCmdArg(arg: string): string {
  if (arg.length === 0) return '""';
  const needsQuotes = /[\s"^&|<>()%!]/.test(arg);
  const escaped = arg.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export async function handleLaunch(args: string[]): Promise<void> {
  const { scriptPath, platform } = resolveLauncherScript();
  const shellKind = parseShellKind();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
HTTP Forge Launcher (from CLI)

USAGE:
  http-forge launch [options] [workspace-path]

OPTIONS:
  --test   Launch HTTP Forge profile (isolated, default)
  --dev    Launch Default profile (all VS Code extensions)
  --both   Launch two instances: test + dev
  --help   Show this help

NOTES:
  - Detects your shell/OS and picks the matching launcher automatically.
  - On Windows this runs scripts/http-forge.bat.
  - On Linux/macOS this runs scripts/http-forge.sh.
`);
    return;
  }

  const modeArgs = args.length === 0 ? ['--test'] : args;

  await new Promise<void>((resolve, reject) => {
    let child;

    if (platform === 'win32') {
      const cmdExe = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
      const commandLine = `"${scriptPath}" ${modeArgs.map(quoteForCmdArg).join(' ')}`.trim();
      child = spawn(cmdExe, ['/d', '/s', '/c', commandLine], {
        stdio: 'inherit',
        windowsHide: false,
      });
    } else {
      const preferredShell = shellKind === 'bash' ? '/bin/bash' : '/bin/sh';
      child = spawn(preferredShell, [scriptPath, ...modeArgs], {
        stdio: 'inherit',
      });
    }

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Launcher exited with code ${code}`));
      }
    });
  });
}
