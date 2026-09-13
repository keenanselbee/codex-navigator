'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { normaliseColour, readColours, repositoryColourKey, blendColours, inheritedColour } = require('../dist/colours');

test('hex colours normalise short and full values and reject CSS or alpha input', () => {
  assert.equal(normaliseColour(' #aB3 '), '#AABB33');
  assert.equal(normaliseColour('#12aBef'), '#12ABEF');
  for (const value of [null, {}, '#12345', '#12345678', 'red', '#abc;display:none', 'url(x)']) assert.equal(normaliseColour(value), undefined);
  const saved = readColours({ 'local/a': '#123', 'local/b': 'red', '__proto__': '#FFF', 'local/a/b': '#123' }, 'chat');
  assert.deepEqual({ ...saved }, { 'local/a': '#112233' });
});

test('repository inheritance is equal, order-independent, and ignores uncoloured or repeated roots', () => {
  const a = path.resolve('alpha'), b = path.resolve('beta'), c = path.resolve('uncoloured');
  const colours = readColours({ [a]: '#F00', [b]: '#00F', relative: '#0F0' }, 'repository');
  assert.equal(inheritedColour(undefined, [c], colours), undefined);
  assert.equal(inheritedColour(undefined, [a, c], colours), '#FF0000');
  assert.equal(inheritedColour('#abc', [a, b], colours), '#AABBCC');
  assert.equal(inheritedColour(undefined, [a, a, c, b], colours), '#8C53A2');
  assert.equal(inheritedColour(undefined, [b, a], colours), '#8C53A2');
  colours[repositoryColourKey(a)] = '#00FF00';
  assert.equal(inheritedColour(undefined, [a], colours), '#00FF00');
  if (process.platform === 'win32') assert.equal(inheritedColour(undefined, [a.toUpperCase()], colours), '#00FF00');
});

test('Oklab mixing preserves identical colours and handles black and white', () => {
  assert.equal(blendColours([]), undefined);
  assert.equal(blendColours(['#FFF', '#FFF']), '#FFFFFF');
  assert.equal(blendColours(['#000', '#000']), '#000000');
  assert.equal(blendColours(['#000', '#FFF']), '#636363');
  assert.equal(blendColours(['#6B8AFD', '#6B8AFD']), '#6B8AFD');
});
