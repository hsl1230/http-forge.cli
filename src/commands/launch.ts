import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

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
      // cmd.exe /c quirk: when the command begins with ", the entire argument must
      // be wrapped in an additional outer pair of quotes so cmd strips them and
      // executes the inner quoted path correctly.
      // windowsVerbatimArguments prevents Node.js from re-escaping the quotes,
      // which would turn "path" into \"path\" and break cmd.exe's parsing.
      const cmdArg = commandLine.startsWith('"') ? `"${commandLine}"` : commandLine;
      child = spawn(cmdExe, ['/d', '/s', '/c', cmdArg], {
        stdio: 'inherit',
        windowsHide: false,
        windowsVerbatimArguments: true,
      });
    } else {
      // The script declares #!/bin/bash; spawn it directly so the shebang is honoured.
      child = spawn(scriptPath, modeArgs, {
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
