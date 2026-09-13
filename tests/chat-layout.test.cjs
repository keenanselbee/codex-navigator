'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { navigatorLayout, createNavigatorLayout } = require('../media/chat-layout');

test('reload restores three columns at the same threshold height after transient startup sizes', () => {
  const before = createNavigatorLayout();
  before(700, 150);
  const saved = JSON.parse(JSON.stringify(before(700, 185)));
  assert.equal(saved.columns, 3);
  assert.equal(navigatorLayout(700, 185).columns, 2, 'fresh threshold calculation reproduces the old issue');
  const after = createNavigatorLayout(saved);
  assert.equal(after(0, 0), undefined, 'hidden startup does not choose a layout');
  after(700, 500);
  assert.deepEqual(after(700, 185), saved, 'intermediate full-height pane does not discard the saved choice');
  assert.equal(after(700, 205).columns, 2, 'real resizing still switches layouts');
  assert.equal(after(700, 185).columns, 2, 'saved startup choice is consumed, not forced forever');
});

test('restored layout refits changed widths and fonts without trusting saved capacity', () => {
  const saved = { mode: 'compact', height: 185, columns: 999, capacity: 999 };
  assert.equal(createNavigatorLayout(saved)(320, 185).columns, 1);
  assert.equal(createNavigatorLayout(saved)(1400, 370, 26).columns, 3);
  for (const value of [null, {}, { mode: 'invalid', height: 185 }, { mode: 'compact', height: -1 }]) {
    assert.equal(createNavigatorLayout(value)(700, 185).columns, 2);
  }
});

test('height chooses A/B/C at a fixed width; width only changes readable capacity', () => {
  assert.equal(navigatorLayout(740, 400).mode, 'list');
  assert.equal(navigatorLayout(740, 200).mode, 'columns');
  assert.equal(navigatorLayout(740, 100).mode, 'compact');
  for (const height of [100, 240, 400]) {
    assert.equal(navigatorLayout(320, height).mode, navigatorLayout(1100, height).mode);
    assert.ok(navigatorLayout(1100, height).capacity >= navigatorLayout(320, height).capacity);
  }
});

test('small splitter movements do not oscillate layouts and large moves still switch', () => {
  assert.equal(navigatorLayout(740, 332, 13, 'list').mode, 'list');
  assert.equal(navigatorLayout(740, 346, 13, 'columns').mode, 'columns');
  assert.equal(navigatorLayout(740, 185, 13, 'compact').mode, 'compact');
  assert.equal(navigatorLayout(740, 175, 13, 'columns').mode, 'columns');
  assert.equal(navigatorLayout(740, 100, 13, 'list').mode, 'compact');
  assert.equal(navigatorLayout(740, 500, 13, 'compact').mode, 'list');
});

test('large fonts retain row space; capacity follows available height without an eight-chat floor', () => {
  for (const width of [80, 320, 740, 2000]) for (const height of [20, 100, 200, 400, 10000]) {
    const layout = navigatorLayout(width, height, 26);
    assert.ok(layout.rowHeight >= 56);
    assert.ok(layout.columns >= 1 && layout.columns <= 200);
    assert.ok(layout.capacity >= 0 && layout.capacity <= 200);
  }
  assert.ok(navigatorLayout(740, 100, 26).columns < navigatorLayout(740, 100).columns);
  assert.equal(navigatorLayout(320, 20).capacity, 0);
  assert.ok(navigatorLayout(320, 100).capacity < 8);
  assert.ok(navigatorLayout(1100, 500).capacity > 8);
});

test('wide views keep adding columns in every height mode', () => {
  for (const height of [100, 240, 400]) {
    assert.ok(navigatorLayout(3600, height).columns > 4);
    assert.ok(navigatorLayout(3600, height).capacity > navigatorLayout(1900, height).capacity);
  }
});
