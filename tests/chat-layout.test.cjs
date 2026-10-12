'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { navigatorLayout, createNavigatorLayout } = require('../media/chat-layout');

test('fixed presentations survive height changes while columns and capacity fit width and font size', () => {
  for (const mode of ['columns', 'list', 'compact']) {
    const choose = createNavigatorLayout();
    for (const height of [100, 185, 240, 346, 600]) {
      const narrow = choose(180, height, 13, mode), wide = choose(1800, height, 13, mode);
      assert.equal(narrow.mode, mode); assert.equal(wide.mode, mode);
      assert.equal(narrow.columns, 1); assert.ok(wide.columns > 1);
      const large = choose(1800, height, 26, mode);
      assert.equal(large.mode, mode);
      assert.ok(large.columns < wide.columns);
      assert.ok(large.capacity <= wide.capacity);
      assert.equal(choose(180, 10, 26, mode).capacity, 0);
    }
  }
});

test('returning to Auto discards forced hysteresis and old restored choices', () => {
  const choose = createNavigatorLayout({ mode: 'compact', height: 185 });
  assert.equal(choose(780, 185, 13, 'compact').mode, 'compact');
  assert.equal(choose(780, 185, 13, 'auto').mode, 'columns');
  assert.equal(choose(780, 346, 13, 'columns').mode, 'columns');
  assert.equal(choose(780, 346, 13, 'auto').mode, 'list');
  assert.equal(choose(780, 100, 13, 'list').mode, 'list');
  assert.equal(choose(780, 100, 13, 'invalid').mode, 'compact');
});

test('reloaded fixed layouts use the setting at new dimensions and Auto ignores a saved forced mode', () => {
  const saved = createNavigatorLayout()(780, 346, 13, 'columns');
  const restored = createNavigatorLayout(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored(0, 0, 13, 'columns'), undefined);
  assert.equal(restored(320, 600, 13, 'columns').mode, 'columns');
  assert.equal(restored(320, 600, 13, 'columns').columns, 1);
  assert.equal(createNavigatorLayout(saved)(780, 346, 13, 'auto').mode, 'list');
});

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


test('frame fitting fills normal rows without enlarging sparse rows beyond the cap', () => {
  const { fittedRowHeight } = require('../media/chat-layout');
  assert.equal(fittedRowHeight(120, 3, 36), 40);
  assert.equal(fittedRowHeight(125, 3, 40), 125 / 3);
  assert.equal(fittedRowHeight(500, 1, 36), 54);
  assert.equal(fittedRowHeight(0, 0, 36), 36);
});
