'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { highlightMode, migrateHighlightSettings } = require('../dist/highlight-settings');

function fixture(layers, fail = false) {
  const fields = ['globalValue', 'workspaceValue', 'workspaceFolderValue'];
  const config = folder => ({
    inspect(key) { return Object.fromEntries(fields.map((field, i) => [field, (i === 2 ? layers[folder] : layers[i])?.[key]])); },
    get(key, fallback) { const values = this.inspect(key); return values.workspaceFolderValue ?? values.workspaceValue ?? values.globalValue ?? fallback; },
    async update(key, value, target) {
      if (fail === true || fail === target) throw new Error('Read-only settings');
      const layer = layers[target === 3 ? folder : target - 1];
      if (value === undefined) delete layer[key]; else layer[key] = value;
    },
  });
  return { config, workspace: { workspaceFolders: layers.slice(2).map((_, i) => ({ uri: i + 2 })), getConfiguration: (_section, folder) => config(folder) } };
}

test('highlight migration preserves all legacy combinations and removes old switches', async () => {
  for (const enabled of [true, false]) for (const last of [true, false]) {
    const layers = [{ highlightRecentlyViewedChats: enabled, highlightOnlyLastViewedChat: last }, {}];
    const f = fixture(layers), before = highlightMode(f.config());
    await migrateHighlightSettings(f.workspace);
    assert.equal(highlightMode(f.config()), before);
    assert.deepEqual(layers[0], { highlightMode: enabled ? last ? 'last' : 'recent' : 'off' });
    await migrateHighlightSettings(f.workspace);
    assert.equal(highlightMode(f.config()), before, 'migration can be repeated');
  }
});

test('highlight migration keeps overrides at their original user, workspace and folder scopes', async () => {
  const layers = [{ highlightOnlyLastViewedChat: true }, { highlightRecentlyViewedChats: false },
    { highlightRecentlyViewedChats: true }, { highlightOnlyLastViewedChat: false }];
  const f = fixture(layers);
  await migrateHighlightSettings(f.workspace);
  assert.deepEqual(layers, [{ highlightMode: 'last' }, { highlightMode: 'off' }, { highlightMode: 'last' }, { highlightMode: 'off' }]);
});

test('highlight migration respects new choices and leaves defaults and failed writes alone', async () => {
  const layers = [{ highlightMode: 'recent', highlightRecentlyViewedChats: false }, {}];
  await migrateHighlightSettings(fixture(layers).workspace);
  assert.deepEqual(layers, [{ highlightMode: 'recent' }, {}]);
  const defaults = [{}, {}]; const fresh = fixture(defaults);
  await migrateHighlightSettings(fresh.workspace);
  assert.equal(highlightMode(fresh.config()), 'recent'); assert.deepEqual(defaults, [{}, {}]);
  const old = [{ highlightRecentlyViewedChats: false }, {}]; const locked = fixture(old, true);
  await assert.rejects(migrateHighlightSettings(locked.workspace), /Read-only/);
  assert.equal(highlightMode(locked.config()), 'off');
  assert.deepEqual(old, [{ highlightRecentlyViewedChats: false }, {}]);
  const partial = [{ highlightOnlyLastViewedChat: true }, { highlightRecentlyViewedChats: false }];
  const blockedWorkspace = fixture(partial, 2);
  await assert.rejects(migrateHighlightSettings(blockedWorkspace.workspace), /Read-only/);
  assert.equal(highlightMode(blockedWorkspace.config()), 'off', 'unmigrated workspace still overrides migrated user choice');
  assert.equal(partial[0].highlightOnlyLastViewedChat, true, 'old inherited values remain until all replacements succeed');
  await migrateHighlightSettings(fixture(partial).workspace);
  assert.deepEqual(partial, [{ highlightMode: 'last' }, { highlightMode: 'off' }]);
});
