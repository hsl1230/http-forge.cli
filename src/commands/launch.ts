import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function isGitBashOnWindows(): boolean {
  if (process.platform !== 'win32') return false;
  // Git Bash (MSYS2/MinGW) sets MSYSTEM=MINGW64|MINGW32|MSYS and SHELL=/usr/bin/bash.
  // Also check BASH_VERSION, OSTYPE=msys, TERM_PROGRAM=mintty (MinTTY).
  if (process.env.MSYSTEM) return true;
  if (process.env.MSYS) return true;
  if (process.env.SHELL && process.env.SHELL.includes('bash')) return true;
  if (process.env.BASH && process.env.BASH.includes('bash')) return true;
  if (process.env.BASH_VERSION) return true;
  if (process.env.OSTYPE && process.env.OSTYPE.includes('msys')) return true;
  if (process.env.TERM_PROGRAM === 'mintty') return true;
  return false;
}

function isPowerShellOnWindows(): boolean {
  if (process.platform !== 'win32') return false;
  if (isGitBashOnWindows()) return false;
  // PowerShell sets POWERSHELL_DISTRIBUTION_CHANNEL or PSExecutionPolicyPreference
  // Note: PSModulePath exists in both cmd and PowerShell on modern Windows, so not reliable alone.
  if (process.env.POWERSHELL_DISTRIBUTION_CHANNEL) return true;
  if (process.env.PSExecutionPolicyPreference) return true;
  // Fallback: check parent shell via ComSpec is still cmd.exe, so we treat
  // non-Git-Bash as cmd/powershell which both use the .bat launcher.
  return false;
}

function detectWindowsShell(): 'git-bash' | 'powershell' | 'cmd' {
  if (isGitBashOnWindows()) return 'git-bash';
  if (isPowerShellOnWindows()) return 'powershell';
  return 'cmd';
}

// Convert Windows path (C:\foo\bar) to MSYS posix (/c/foo/bar) for Git Bash.
// Git Bash's bash handles Windows paths, but posix is more reliable for shebang.
function toPosixForGitBash(winPath: string): string {
  // Already posix
  if (winPath.startsWith('/')) return winPath;
  const m = winPath.match(/^([a-zA-Z]):[\\/](.*)/);
  if (!m) return winPath.replace(/\\/g, '/');
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, '/');
  return `/${drive}/${rest}`;
}

function resolveLauncherScript(): { scriptPath: string; platform: 'win32' | 'unix'; shell?: string } {
  const root = path.resolve(__dirname, '..', '..');
  const isWindows = process.platform === 'win32';
  const isGitBash = isGitBashOnWindows();

  // On Windows Git Bash we must run the .sh script via bash, not the .bat.
  const scriptPath = isWindows && !isGitBash
    ? path.join(root, 'scripts', 'http-forge.bat')
    : path.join(root, 'scripts', 'http-forge.sh');

  if (!existsSync(scriptPath)) {
    throw new Error(
      `Launcher script not found: ${scriptPath}. Reinstall @http-forge/cli or ensure scripts are packaged.`
    );
  }

  if (isWindows) {
    return { scriptPath, platform: isGitBash ? 'unix' : 'win32', shell: isGitBash ? 'git-bash' : detectWindowsShell() };
  }
  return { scriptPath, platform: 'unix' };
}

function quoteForCmdArg(arg: string): string {
  if (arg.length === 0) return '""';
  const needsQuotes = /[\s"^&|<>()%!]/.test(arg);
  const escaped = arg.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export { isGitBashOnWindows, isPowerShellOnWindows, detectWindowsShell, resolveLauncherScript, toPosixForGitBash };

export async function handleLaunch(args: string[]): Promise<void> {
  const { scriptPath, platform, shell } = resolveLauncherScript() as { scriptPath: string; platform: 'win32' | 'unix'; shell?: string };

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
  - On Windows Git Bash this runs scripts/http-forge.sh via bash.
  - On Windows cmd/powershell this runs scripts/http-forge.bat via cmd.exe.
  - On Linux/macOS this runs scripts/http-forge.sh via bash.
`);
    return;
  }

  const modeArgs = args.length === 0 ? ['--test'] : args;

  await new Promise<void>((resolve, reject) => {
    let child;

    if (platform === 'win32') {
      const cmdExe = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
      // Start with `call` so cmd.exe does not treat the quoted batch path as a title.
      const commandLine = `call "${scriptPath}" ${modeArgs.map(quoteForCmdArg).join(' ')}`.trim();
      child = spawn(cmdExe, ['/d', '/s', '/c', commandLine], {
        stdio: 'inherit',
        windowsHide: false,
        windowsVerbatimArguments: true,
      });
    } else {
      // Unix or Windows Git Bash: invoke Bash explicitly because npm archives can lose the executable bit.
      // On Windows Git Bash, prefer the bash from $SHELL or MSYSTEM, fallback to 'bash' in PATH.
      const isWinGitBash = process.platform === 'win32' && shell === 'git-bash';
      const bashExe = isWinGitBash
        ? process.env.SHELL || process.env.BASH || 'bash'
        : '/bin/bash';
      const effectiveScript = isWinGitBash ? toPosixForGitBash(scriptPath) : scriptPath;
      child = spawn(bashExe, [effectiveScript, ...modeArgs], {
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
