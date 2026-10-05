import type * as vscode from 'vscode';

export type NotificationMode = 'off' | 'always' | 'whenFocused' | 'whenUnfocused';
export type NotificationKind = 'finished' | 'input';
export type NotificationChannel = 'sound' | 'desktop';
export type NotificationPolicy = Record<NotificationKind, Record<NotificationChannel, NotificationMode>>;
const keys = ['responseFinishedSound', 'responseFinishedNotification', 'questionSound', 'questionNotification'] as const;
const oldKeys = ['notificationSounds', 'desktopNotifications', 'notificationsOnlyWhenUnfocused'] as const;
const defaults: NotificationMode[] = ['always', 'whenUnfocused', 'always', 'always'];

export function notificationSettings(config: Pick<vscode.WorkspaceConfiguration, 'inspect'>): NotificationPolicy {
  // These settings have application scope. Read explicit user values only so
  // untouched installations receive new defaults, including after a failed migration.
  const old = oldKeys.map(key => config.inspect<boolean>(key)?.globalValue);
  const legacy = old.some(value => typeof value === 'boolean');
  const mode = old[2] === false ? 'always' : 'whenUnfocused';
  const previous: NotificationMode[] = [old[0] === false ? 'off' : mode, old[1] === false ? 'off' : mode];
  const values = keys.map((key, index) => {
    const value = config.inspect<NotificationMode>(key)?.globalValue;
    return value && ['off', 'always', 'whenFocused', 'whenUnfocused'].includes(value) ? value : legacy ? previous[index % 2] : defaults[index];
  });
  return { finished: { sound: values[0], desktop: values[1] }, input: { sound: values[2], desktop: values[3] } };
}

export function notificationChannels(policy: NotificationPolicy, kind: NotificationKind, focused: boolean): Record<NotificationChannel, boolean> {
  const allowed = (mode: NotificationMode) => mode === 'always' || mode === 'whenFocused' && focused || mode === 'whenUnfocused' && !focused;
  return { sound: allowed(policy[kind].sound), desktop: allowed(policy[kind].desktop) };
}

export async function migrateNotificationSettings(config: vscode.WorkspaceConfiguration): Promise<void> {
  if (!oldKeys.some(key => typeof config.inspect<boolean>(key)?.globalValue === 'boolean')) return;
  const policy = notificationSettings(config);
  const values = [policy.finished.sound, policy.finished.desktop, policy.input.sound, policy.input.desktop];
  // Complete all replacements before deleting old settings. Explicit new choices
  // win, and a failed write leaves enough information to retry without changing behaviour.
  for (let i = 0; i < keys.length; i++) {
    if (config.inspect(keys[i])?.globalValue === undefined) await config.update(keys[i], values[i], 1);
  }
  for (const key of oldKeys) await config.update(key, undefined, 1);
}
