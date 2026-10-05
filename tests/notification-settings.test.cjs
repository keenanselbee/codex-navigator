'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { notificationSettings, notificationChannels, migrateNotificationSettings } = require('../dist/notification-settings');

function fixture(values = {}, failAt) {
  let writes = 0;
  const config = {
    inspect: key => ({ globalValue: values[key] }),
    async update(key, value, target) {
      assert.equal(target, 1);
      if (++writes === failAt) throw new Error('Read-only settings');
      if (value === undefined) delete values[key]; else values[key] = value;
    },
  };
  return { values, config, writes: () => writes };
}

test('untouched settings use agreed defaults without saving overrides', async () => {
  const f = fixture(); await migrateNotificationSettings(f.config);
  assert.equal(f.writes(), 0);
  const policy = notificationSettings(f.config);
  assert.deepEqual(policy, { finished: { sound: 'always', desktop: 'whenUnfocused' }, input: { sound: 'always', desktop: 'always' } });
  assert.deepEqual(notificationChannels(policy, 'finished', true), { sound: true, desktop: false });
  assert.deepEqual(notificationChannels(policy, 'input', true), { sound: true, desktop: true });
  assert.deepEqual(notificationChannels(policy, 'finished', false), { sound: true, desktop: true });
});

test('every channel independently supports all focus modes for each event kind', () => {
  for (const kind of ['finished','input']) for (const sound of ['off','always','whenFocused','whenUnfocused']) {
    for (const desktop of ['off','always','whenFocused','whenUnfocused']) for (const focused of [false,true]) {
      const expected = mode => mode === 'always' || mode === (focused ? 'whenFocused' : 'whenUnfocused');
      const policy = { finished: { sound: 'off', desktop: 'off' }, input: { sound: 'off', desktop: 'off' }, [kind]: { sound, desktop } };
      assert.deepEqual(notificationChannels(policy, kind, focused), { sound: expected(sound), desktop: expected(desktop) });
    }
  }
});

test('explicit legacy combinations and individual choices migrate without changing behaviour', async () => {
  for (const sound of [undefined,false,true]) for (const desktop of [undefined,false,true]) for (const unfocused of [undefined,false,true]) {
    const values = Object.fromEntries(Object.entries({ notificationSounds: sound, desktopNotifications: desktop, notificationsOnlyWhenUnfocused: unfocused }).filter(([,v]) => v !== undefined));
    if (!Object.keys(values).length) continue;
    const f = fixture(values), before = notificationSettings(f.config);
    const mode = unfocused === false ? 'always' : 'whenUnfocused';
    assert.deepEqual(before, { finished: { sound: sound === false ? 'off' : mode, desktop: desktop === false ? 'off' : mode }, input: { sound: sound === false ? 'off' : mode, desktop: desktop === false ? 'off' : mode } });
    await migrateNotificationSettings(f.config);
    assert.deepEqual(notificationSettings(f.config), before);
    assert.equal(Object.keys(values).length, 4);
    const count = f.writes(); await migrateNotificationSettings(f.config); assert.equal(f.writes(), count);
  }
});

test('migration preserves new choices and recovers from failure at every write or deletion', async () => {
  for (let failAt = 1; failAt <= 7; failAt++) {
    const f = fixture({ notificationSounds: false, notificationsOnlyWhenUnfocused: false }, failAt);
    const before = notificationSettings(f.config);
    await assert.rejects(migrateNotificationSettings(f.config), /Read-only/);
    assert.deepEqual(notificationSettings(f.config), before);
    await migrateNotificationSettings(fixture(f.values).config);
    assert.deepEqual(notificationSettings(f.config), before);
  }
  const f = fixture({ desktopNotifications: false, questionNotification: 'whenFocused' });
  await migrateNotificationSettings(f.config);
  assert.equal(f.values.questionNotification, 'whenFocused');
  assert.equal(f.values.responseFinishedNotification, 'off');
});

test('manifest exposes exactly four application-scoped policies with matching defaults', () => {
  const properties = require('../package.json').contributes.configuration.find(g => g.id === 'notifications.codexNavigator').properties;
  assert.equal(Object.keys(properties).length, 4);
  const config = fixture(Object.fromEntries(Object.entries(properties).map(([key, value]) => [key.replace('codexNavigator.',''),value.default]))).config;
  assert.deepEqual(notificationSettings(config), notificationSettings(fixture().config));
  for (const property of Object.values(properties)) {
    assert.equal(property.scope, 'application');
    assert.deepEqual(property.enum, ['off','always','whenFocused','whenUnfocused']);
  }
});
