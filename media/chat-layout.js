'use strict';
// Height selects the presentation; width determines how many readable columns fit.
function navigatorLayout(width, height, fontSize = 13, previous = '') {
  const scale = Math.max(1, fontSize / 13), h = height / scale, w = width / scale;
  let mode = h >= 340 ? 'list' : h >= 180 ? 'columns' : 'compact';
  if (previous === 'list' && h >= 328 || previous === 'columns' && h >= 168 && h < 352
      || previous === 'compact' && h < 192) { mode = previous; }
  const minWidth = mode === 'list' ? 440 : mode === 'columns' ? 250 : 180;
  const columns = Math.max(1, Math.min(200, Math.floor((w + 4) / (minWidth + 4))));
  const rowHeight = Math.ceil((mode === 'list' ? 28 : mode === 'columns' ? 42 : 36) * scale);
  // Upper bound only: the renderer measures wrapped content before showing rows.
  const capacity = Math.min(200, Math.max(0, Math.floor(height / rowHeight) * columns));
  return { mode, columns, rowHeight, capacity };
}
// VS Code may report intermediate sizes while restoring its split panes. Keep the
// saved threshold choice available until the view reaches its previous height.
function createNavigatorLayout(saved) {
  let restored = saved && ['compact', 'columns', 'list'].includes(saved.mode)
    && Number.isFinite(saved.height) && saved.height > 0 ? saved : undefined;
  let current;
  return (width, height, fontSize = 13) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return current;
    const normalizedHeight = height / Math.max(1, fontSize / 13);
    const matches = restored && Math.abs(normalizedHeight - restored.height) <= 12;
    current = { ...navigatorLayout(width, height, fontSize, matches ? restored.mode : current?.mode), height: normalizedHeight };
    if (matches) restored = undefined;
    return current;
  };
}
if (typeof module !== 'undefined') { module.exports = { navigatorLayout, createNavigatorLayout }; }
