'use strict';
const api = acquireVsCodeApi(), el = id => document.getElementById(id);
const presets = [['Red', '#E45B65'], ['Orange', '#E58C42'], ['Yellow', '#C8AC36'], ['Green', '#4EA876'],
  ['Teal', '#35A7AE'], ['Blue', '#6B8AFD'], ['Purple', '#A37DE0'], ['Pink', '#D66BAD']];
let colour = null, state, lastSwatch;
function normalise(value) {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) return '#' + [...text.slice(1)].map(char => char + char).join('').toUpperCase();
}
function render() {
  el('colour-error').textContent = colour === undefined ? 'Enter a hex colour such as #6B8AFD or #68F.' : '';
  el('apply').disabled = !state || colour === undefined;
  el('choice').textContent = colour === undefined ? '' : colour === null
    ? state.resetLabel + (state.inherited ? ': ' + state.inherited : '') : 'Selected: ' + colour;
  el('reset').setAttribute('aria-pressed', String(colour === null));
  for (const button of el('presets').children) button.setAttribute('aria-pressed', String(button.dataset.colour === colour));
}
function select(value) {
  lastSwatch = undefined;
  colour = value;
  el('hex').value = value ?? '';
  el('picker').value = value ?? state.inherited ?? '#6B8AFD';
  render();
}
for (const [name, value] of presets) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'swatch swatch-' + name.toLowerCase(); button.dataset.colour = value;
  button.textContent = name; button.title = name + ' ' + value; button.disabled = true;
  button.addEventListener('click', () => {
    if (state && lastSwatch === value && colour === value) { api.postMessage({ type: 'apply', colour }); return; }
    select(value); lastSwatch = value;
  }); el('presets').append(button);
}
window.addEventListener('message', event => {
  if (state) return;
  state = event.data;
  el('target').textContent = state.title;
  el('reset').textContent = state.resetLabel;
  for (const button of el('presets').children) button.disabled = false;
  el('picker').disabled = el('hex').disabled = el('reset').disabled = false;
  select(state.initial); el('hex').focus();
});
el('picker').addEventListener('input', () => select(normalise(el('picker').value)));
el('hex').addEventListener('input', () => {
  lastSwatch = undefined;
  colour = normalise(el('hex').value);
  if (colour) el('picker').value = colour;
  render();
});
el('reset').addEventListener('click', () => select(null));
el('apply').addEventListener('click', () => { if (state && colour !== undefined) api.postMessage({ type: 'apply', colour }); });
el('cancel').addEventListener('click', () => api.postMessage({ type: 'cancel' }));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') api.postMessage({ type: 'cancel' });
});
api.postMessage({ type: 'ready' });
