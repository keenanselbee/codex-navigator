import * as path from 'node:path';
import { accessSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import type { NotificationChannel } from './notification-settings';

type Platform = 'win32' | 'darwin' | 'linux';
export type NotificationRequest = { title: string; message: string; sound: boolean; desktop: boolean; canDeliver?: (channel: NotificationChannel) => boolean };
export type NotificationCommand = (file: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<boolean>;

export interface NotificationDeliveryOptions {
  extensionPath: string;
  report: (message: string) => void;
  platform?: NodeJS.Platform;
  run?: NotificationCommand;
  codexAppPath?: string;
}

const WINDOWS_TOAST = `
$ErrorActionPreference = 'Stop'
$app = Get-StartApps | Where-Object { $_.Name -eq 'Visual Studio Code' -or $_.Name -eq 'Visual Studio Code - Insiders' } | Select-Object -First 1
if (-not $app -or -not $app.AppID) { exit 2 }
$manager = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
$template = $manager::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$nodes = $template.GetElementsByTagName('text')
$null = $nodes.Item(0).AppendChild($template.CreateTextNode($env:CODEX_NAVIGATOR_TITLE))
$null = $nodes.Item(1).AppendChild($template.CreateTextNode($env:CODEX_NAVIGATOR_MESSAGE))
$audio = $template.CreateElement('audio')
$audio.SetAttribute('silent', 'true')
$null = $template.DocumentElement.AppendChild($audio)
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
$manager::CreateToastNotifier($app.AppID).Show($toast)
`;

const WINDOWS_PLAY = `
$ErrorActionPreference = 'Stop'
$sound = $env:CODEX_NAVIGATOR_SOUND
if (-not $sound -or -not [IO.File]::Exists($sound)) { exit 2 }
$player = [System.Media.SoundPlayer]::new($sound)
$player.PlaySync()
`;

const WINDOWS_SYSTEM_PLAY = String.raw`
$ErrorActionPreference = 'Stop'
$key = Get-Item -LiteralPath 'HKCU:\AppEvents\Schemes\Apps\.Default\Notification.Default\.Current' -ErrorAction SilentlyContinue
$sound = if ($key) { $key.GetValue('') } else { $null }
if ($sound) { $sound = [Environment]::ExpandEnvironmentVariables($sound) }
if (-not $sound -or -not [IO.File]::Exists($sound)) { $sound = Join-Path $env:WINDIR 'Media\Windows Notify System Generic.wav' }
if (-not [IO.File]::Exists($sound)) { exit 2 }
$player = [System.Media.SoundPlayer]::new($sound)
$player.PlaySync()
`;

const MAC_TOAST = 'on run argv\n display notification (item 2 of argv) with title (item 1 of argv)\nend run';

function exists(file: string): boolean {
  try { accessSync(file); return true; } catch { return false; }
}

function cleanText(value: string, limit: number): string {
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit).trim();
}

async function appResourceRoots(platform: Platform, explicit?: string): Promise<string[]> {
  if (explicit) return [explicit];
  if (platform === 'win32') {
    let storeLocation: string | undefined;
    try {
      storeLocation = await new Promise<string | undefined>(resolve => execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
        'Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1 -ExpandProperty InstallLocation',
      ], { encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 1024 },
      (error, stdout) => resolve(error ? undefined : stdout.trim() || undefined)));
    } catch { /* Store package discovery is optional. */ }
    return [
    process.env.CODEX_APP_PATH, storeLocation,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Codex', 'resources'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Codex', 'resources'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Codex', 'resources'),
    ].filter((value): value is string => !!value);
  }
  if (platform === 'darwin') return [
    process.env.CODEX_APP_PATH,
    '/Applications/Codex.app/Contents/Resources',
    process.env.HOME && path.join(process.env.HOME, 'Applications', 'Codex.app', 'Contents', 'Resources'),
  ].filter((value): value is string => !!value);
  return [process.env.CODEX_APP_PATH, '/opt/Codex/resources', '/usr/share/codex/resources', '/usr/lib/codex/resources']
    .filter((value): value is string => !!value);
}

// Only inspect known application resource roots. Never scan a home directory or PATH.
export async function findCodexNotificationSound(platform: Platform, appPath?: string): Promise<string | undefined> {
  const skipped = new Set(['node_modules', 'locales', 'extensions', 'bin']);
  for (const root of await appResourceRoots(platform, appPath)) {
    const direct = path.join(root, 'app', 'resources', 'codex-notification.wav');
    if (exists(direct)) return direct;
    const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
    let visited = 0;
    while (queue.length && visited++ < 400) {
      const { directory, depth } = queue.shift()!;
      let entries;
      try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
      const sound = entries.find(entry => entry.isFile() && entry.name === 'codex-notification.wav');
      if (sound) return path.join(directory, sound.name);
      if (depth >= 6) continue;
      for (const entry of entries) {
        if (entry.isDirectory() && !skipped.has(entry.name)) queue.push({ directory: path.join(directory, entry.name), depth: depth + 1 });
      }
    }
  }
}

async function runCommand(file: string, args: string[], env?: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise(resolve => {
    execFile(file, args, { env: env && { ...process.env, ...env }, windowsHide: true, timeout: 5000, maxBuffer: 4096 },
      error => resolve(!error));
  });
}

export class NotificationDelivery {
  private readonly platform: NodeJS.Platform;
  private readonly run: NotificationCommand;

  constructor(private readonly options: NotificationDeliveryOptions) {
    this.platform = options.platform ?? process.platform;
    this.run = options.run ?? runCommand;
  }

  async deliver(request: NotificationRequest): Promise<void> {
    const canDeliver = (channel: NotificationChannel) => request[channel] && request.canDeliver?.(channel) !== false;
    const title = cleanText(request.title, 200) || 'Codex Navigator';
    const message = cleanText(request.message, 500) || 'Chat update';
    if (canDeliver('desktop')) {
      let shown = false;
      if (this.platform === 'win32') shown = await this.powershell(WINDOWS_TOAST, {
        CODEX_NAVIGATOR_TITLE: title, CODEX_NAVIGATOR_MESSAGE: message,
      });
      else if (this.platform === 'darwin') shown = await this.tryRun('osascript', ['-e', MAC_TOAST, '--', title, message]);
      else if (this.platform === 'linux') shown = await this.tryRun('notify-send', ['--app-name=Codex Navigator', '--hint=boolean:suppress-sound:true', '--', title, message]);
      if (!shown && canDeliver('desktop')) this.options.report('Codex Navigator could not show a desktop notification. Check that system notifications are available.');
    }
    if (canDeliver('sound') && !await this.playSound(() => canDeliver('sound')) && canDeliver('sound')) {
      this.options.report('Codex Navigator could not play a notification sound. Check the system audio output.');
    }
  }

  private powershell(script: string, env?: NodeJS.ProcessEnv): Promise<boolean> {
    return this.tryRun('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], env);
  }

  private async tryRun(file: string, args: string[], env?: NodeJS.ProcessEnv): Promise<boolean> {
    try { return await this.run(file, args, env); } catch { return false; }
  }

  private async playNativeFile(filename: string, canDeliver: () => boolean): Promise<boolean> {
    if (this.platform === 'win32') return this.powershell(WINDOWS_PLAY, { CODEX_NAVIGATOR_SOUND: filename });
    if (this.platform === 'darwin') return this.tryRun('afplay', [filename]);
    if (this.platform === 'linux') return await this.tryRun('paplay', [filename]) || canDeliver() && await this.tryRun('aplay', [filename]);
    return false;
  }

  private async playSound(canDeliver: () => boolean): Promise<boolean> {
    if (this.platform !== 'win32' && this.platform !== 'darwin' && this.platform !== 'linux') return false;
    const codexSound = await findCodexNotificationSound(this.platform, this.options.codexAppPath);
    if (!canDeliver()) return false;
    if (codexSound) {
      if (await this.playNativeFile(codexSound, canDeliver)) return true;
    }
    if (!canDeliver()) return false;
    if (this.platform === 'win32' && await this.powershell(WINDOWS_SYSTEM_PLAY)) return true;
    if (!canDeliver()) return false;
    if (this.platform === 'darwin') {
      const glass = '/System/Library/Sounds/Glass.aiff';
      if (exists(glass) && await this.tryRun('afplay', [glass])) return true;
    }
    if (this.platform === 'linux' && await this.tryRun('canberra-gtk-play', ['-i', 'message-new-instant'])) return true;
    if (!canDeliver()) return false;
    const bundled = path.join(this.options.extensionPath, 'media', 'notification-balafon.wav');
    return exists(bundled) && await this.playNativeFile(bundled, canDeliver);
  }
}
