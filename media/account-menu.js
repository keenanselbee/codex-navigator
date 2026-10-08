'use strict';

function createNavigatorAccounts(api, navigation) {
  const page = document.getElementById('accountPage');
  let state, stateAt = 0, previousFocus, contextAccountId, contextPosition, renamingAccountId, renameValue = '';
  let pendingAction = false, pendingProgress = '', criticalSignature = '';
  let usageRetry, resetAccountId, resetSeen = false;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function button(value, key, action, disabled = false) {
    const node = element('button', '', value);
    node.type = 'button';
    node.dataset.accountFocus = key;
    node.disabled = disabled;
    node.addEventListener('click', action);
    return node;
  }

  function post(action, account, label, force, token) {
    const message = { type: 'accountAction', action };
    if (account) { message.id = account.id; message.generation = account.generation; }
    if (label !== undefined) message.label = label;
    if (force !== undefined) message.force = force;
    if (token !== undefined) message.token = token;
    api.postMessage(message);
    if (!['refresh', 'refreshUsage', 'retryUsage', 'cancelUsage', 'cancelReset', 'copyEmail'].includes(action)) {
      pendingAction = true;
      pendingProgress = action === 'previewReset' ? 'Checking banked resets...'
        : action === 'useReset' ? 'Using banked reset...'
        : action === 'switch' ? 'Switching to ' + identity(account) + '...'
        : action === 'add' || action === 'reconnect' ? 'Preparing sign-in...'
        : action === 'rename' ? 'Saving account label...'
        : action === 'cancelLogin' ? 'Cancelling sign-in...'
        : action === 'forget' ? 'Removing saved sign-in...'
        : action === 'restore' ? 'Restoring previous account...'
        : action === 'retryReload' ? 'Reloading VS Code...' : 'Opening account setup...';
      render();
    }
  }

  function validAccount(account) {
    return account && typeof account.id === 'string' && Number.isSafeInteger(account.generation);
  }

  function identity(account) {
    return String(account.name || account.email || 'Saved account');
  }

  function plan(account) {
    const value = typeof account.plan === 'string' ? account.plan.trim() : '';
    const labels = { free: 'Free', free_workspace: 'Free', guest: 'Free', go: 'Go', plus: 'Plus',
      pro: 'Pro 20x', prolite: 'Pro 5x', team: 'Business', business: 'Business',
      self_serve_business_prolite: 'Business', self_serve_business_usage_based: 'Business',
      edu: 'Edu', enterprise: 'Enterprise', enterprise_cbp_automation: 'Enterprise',
      enterprise_cbp_usage_based: 'Enterprise', ent26: 'Enterprise' };
    return Object.hasOwn(labels, value.toLowerCase()) ? labels[value.toLowerCase()] : value || 'ChatGPT';
  }

  function remaining(window) {
    return window && Number.isFinite(window.usedPercent) && window.usedPercent >= 0 && window.usedPercent <= 100
      ? Math.round(100 - window.usedPercent) + '% left' : 'unavailable';
  }

  function shortWindow(window, fallback = 'Short') {
    const minutes = window?.windowDurationMins;
    if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
    if (minutes === 10080) return 'Week';
    if (minutes < 60) return Math.round(minutes) + 'm';
    if (minutes < 1440) return Math.round(minutes / 60) + 'h';
    return Math.round(minutes / 1440) + 'd';
  }

  function when(value) {
    return Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString() : 'unavailable';
  }

  function resetTime(value) {
    if (!Number.isFinite(value) || value <= 0) return 'unavailable';
    if (value * 1000 < Date.now()) return 'Reset time passed; check again';
    return when(value * 1000);
  }

  function usageSubtitle(account) {
    const usage = account.usage;
    const windows = [[usage?.primary, 'Short'], [usage?.secondary, 'Other window']];
    const available = windows.filter(([window]) => window && Number.isFinite(window.usedPercent)
      && window.usedPercent >= 0 && window.usedPercent <= 100);
    if (!available.length) return 'Usage unavailable';
    return available.map(([window, fallback]) => shortWindow(window, fallback).toLowerCase()
      + ' ' + remaining(window)).join(' · ');
  }

  function bankedExpiry(usage) {
    const seconds = usage?.bankedResetExpiresAt;
    if (!(usage?.bankedResets > 0) || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 32503680000) return '';
    const date = new Date(seconds * 1000), remaining = date.getTime() - Date.now();
    const options = { month: 'short', day: 'numeric' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    if (remaining >= 0 && remaining <= 3 * 24 * 60 * 60 * 1000) {
      options.hour = 'numeric'; options.minute = '2-digit';
    }
    return ' · expiry: ' + date.toLocaleString(undefined, options)
      + (remaining < 0 ? ' (passed; refresh usage)' : '');
  }

  function tooltip(account) {
    const usage = account.usage;
    const lines = [identity(account)];
    if (account.email && account.email !== account.name) lines.push('Email: ' + account.email);
    if (account.workspace) lines.push('Workspace: ' + account.workspace);
    lines.push('Plan: ' + (account.plan ? plan(account) + ' (last known)' : 'unavailable'));
    for (const [window, fallback] of [[usage?.primary, 'Short'], [usage?.secondary, 'Other window']]) {
      const label = shortWindow(window, fallback);
      const left = remaining(window), reset = resetTime(window?.resetsAt);
      if (left !== 'unavailable') lines.push(label + ' remaining: ' + left);
      if (reset !== 'unavailable') lines.push(label + ' reset: ' + reset);
    }
    lines.push('Banked resets: ' + (Number.isSafeInteger(usage?.bankedResets) ? usage.bankedResets : 'unavailable') + bankedExpiry(usage));
    lines.push('Checked: ' + when(usage?.checkedAt));
    if (account.usageProblem) lines.push('Usage: ' + account.usageProblem);
    return lines.join('\n');
  }

  function focus(key) {
    const control = [...page.querySelectorAll('[data-account-focus]')].find(node => node.dataset.accountFocus === key);
    if (control && !control.disabled) control.focus({ preventScroll: true });
  }

  function close(restore = true) {
    if (page.hidden) return;
    page.hidden = true;
    clearInterval(usageRetry); usageRetry = undefined;
    contextAccountId = undefined;
    renamingAccountId = undefined;
    resetAccountId = undefined;
    resetSeen = false;
    post('cancelReset');
    post('cancelUsage');
    navigation.onClose();
    if (restore) {
      const target = previousFocus?.isConnected && previousFocus !== document.body && !previousFocus.closest('#accountPage')
        && previousFocus.getClientRects().length ? previousFocus : document.getElementById('viewport');
      target?.focus({ preventScroll: true });
    }
    previousFocus = undefined;
  }

  function open() {
    if (!page.hidden) return;
    previousFocus = document.activeElement;
    if (!navigation.onOpen()) return;
    page.hidden = false;
    render('accountBack');
    if (!state || Date.now() - stateAt > 2000) post('refresh');
    post('refreshUsage');
    usageRetry = setInterval(() => {
      if (page.hidden || resetAccountId || document.hidden || pendingAction || state?.busy || state?.usageRefreshing
          || !state?.enabled || !state?.supported) return;
      if (state.accounts?.some(account => !account.usage?.primary && !account.usage?.secondary)) post('retryUsage');
    }, 10000);
  }

  function startRename(account) {
    contextAccountId = undefined;
    renamingAccountId = account.id;
    renameValue = account.name || '';
    render('rename:' + account.id);
  }

  function saveRename(account) {
    if (pendingAction || state?.busy || !state?.canSwitch) return;
    const label = renameValue.trim();
    if (label.length > 60 || /[\x00-\x1f\x7f]/.test(label)) {
      const input = page.querySelector('.account-rename');
      input?.setAttribute('aria-invalid', 'true');
      input?.focus();
      return;
    }
    renamingAccountId = undefined;
    post('rename', account, label);
  }

  function openContext(account, x, y) {
    const bounds = page.getBoundingClientRect();
    contextAccountId = account.id;
    contextPosition = { left: Math.max(0, Math.min(x - bounds.left, bounds.width - 160)),
      top: Math.max(0, Math.min(y - bounds.top, bounds.height - 135)) };
    render('label:' + account.id);
  }

  function accountTile(account, busy) {
    const tile = button('', 'switch:' + account.id, () => {
      if (busy || !state.canSwitch) return;
      contextAccountId = undefined;
      post('switch', account);
    }, busy);
    tile.className = 'account-tile';
    tile.setAttribute('aria-disabled', String(!state.canSwitch));
    tile.title = tooltip(account);
    tile.setAttribute('aria-label', (account.selected ? 'Selected account: ' : 'Switch account and reload: ')
      + identity(account) + ', ' + plan(account) + '. ' + usageSubtitle(account));
    const top = element('span', 'account-label-row');
    top.append(element('span', 'account-label', identity(account)));
    top.append(element('span', 'account-plan', '· ' + plan(account)));
    if (account.selected) {
      const check = element('span', 'account-check', '✓');
      check.setAttribute('aria-label', 'Selected');
      top.append(check);
    }
    const bottom = element('span', 'account-name-row');
    bottom.append(element('span', 'account-usage', usageSubtitle(account)));
    tile.append(top, bottom);
    tile.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      openContext(account, event.clientX, event.clientY);
    });
    tile.addEventListener('keydown', event => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      const bounds = tile.getBoundingClientRect();
      openContext(account, bounds.left, bounds.bottom);
    });
    return tile;
  }

  function renameTile(account, busy) {
    const tile = element('div', 'account-tile account-edit');
    const label = element('label', 'account-label', 'Change label');
    const input = element('input', 'account-rename');
    input.type = 'text';
    input.maxLength = 60;
    input.value = renameValue;
    input.dataset.accountFocus = 'rename:' + account.id;
    input.setAttribute('aria-label', 'Custom label for ' + (account.email || identity(account)) + '. Leave blank to use email.');
    input.addEventListener('input', () => { renameValue = input.value; input.removeAttribute('aria-invalid'); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); saveRename(account); }
    });
    label.append(input);
    const controls = element('span', 'account-edit-actions');
    const save = button('Save', 'save:' + account.id, () => saveRename(account), busy || !state.canSwitch);
    const cancel = button('Cancel', 'cancel:' + account.id, () => {
      renamingAccountId = undefined;
      render('switch:' + account.id);
    });
    controls.append(...navigatorActionOrder(save, cancel));
    tile.append(label, controls);
    return tile;
  }

  function cancelReset() {
    if (state?.progress === 'Using banked reset...' || pendingAction && pendingProgress === 'Using banked reset...') return;
    const id = resetAccountId;
    resetAccountId = undefined;
    resetSeen = false;
    post('cancelReset');
    render('switch:' + id);
  }

  function renderReset(busy, currentFocus) {
    const account = state?.accounts?.find(item => item.id === resetAccountId);
    const reset = state?.reset?.accountId === resetAccountId ? state.reset : undefined;
    const dates = Array.isArray(reset?.expiresAt) ? reset.expiresAt : [];
    const consuming = state?.progress === 'Using banked reset...' || pendingAction && pendingProgress === 'Using banked reset...';
    const header = element('div', 'account-header account-reset-header');
    const back = button('Back', 'resetBack', cancelReset, consuming);
    back.setAttribute('aria-label', 'Back to accounts');
    const heading = element('strong', '', 'Use banked reset');
    heading.id = 'accountPageTitle';
    page.setAttribute('aria-labelledby', heading.id);
    header.append(back, heading);
    if (account) {
      const accountName = element('span', 'account-reset-identity', identity(account) + ' · ' + plan(account));
      accountName.title = accountName.textContent;
      header.append(accountName);
    }
    const content = element('div', 'account-content account-reset-content');
    if (busy) {
      const progress = element('p', 'account-progress', state?.progress || pendingProgress);
      progress.setAttribute('role', 'status'); content.append(progress);
    }
    const problem = reset?.problem || state?.problem;
    if (problem) {
      const error = element('p', 'account-problem', problem);
      error.setAttribute('role', 'alert'); content.append(error);
    }
    const list = element('div', 'account-reset-list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Available banked resets, earliest expiry first');
    dates.forEach((expiresAt, index) => {
      const item = element('div', 'account-reset-credit' + (index === 0 ? ' account-reset-selected' : ''));
      item.setAttribute('role', 'listitem');
      item.append(element('strong', '', index === 0 ? 'Will be used' : 'Available'));
      const date = new Date(expiresAt * 1000);
      const expiry = element('time', '', date.toLocaleString(undefined, { month: 'short', day: 'numeric',
        ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' }));
      expiry.dateTime = date.toISOString();
      expiry.setAttribute('aria-label', 'Expires ' + date.toLocaleString());
      item.append(expiry);
      item.title = 'Expires ' + date.toLocaleString();
      list.append(item);
    });
    content.append(list);
    if (!busy && !problem && !dates.length) content.append(element('p', 'account-muted', 'No banked resets available.'));
    const controls = element('div', 'account-reset-actions');
    const use = button('Use banked reset', 'useReset', () => {
      if (!busy && reset && account) post('useReset', account, undefined, undefined, reset.token);
    }, busy || !account || !state?.canSwitch || !!problem || !dates.length || dates[0] * 1000 <= Date.now());
    use.className = 'account-primary';
    controls.append(...navigatorActionOrder(use, button('Cancel', 'cancelReset', cancelReset, consuming)));
    page.append(header, content, controls);
    focus(page.querySelector('[data-account-focus="' + (currentFocus || '') + '"]') ? currentFocus : 'resetBack');
  }

  function render(focusKey) {
    if (page.hidden) return;
    const currentFocus = focusKey || (page.contains(document.activeElement) ? document.activeElement.dataset.accountFocus : undefined);
    const scrollTop = page.querySelector('.account-content')?.scrollTop || 0;
    const busy = !!state?.busy || pendingAction;
    const nextCritical = JSON.stringify([state?.loginEmail || '', state?.problem || '', state?.progress || '', busy]);
    const criticalChanged = nextCritical !== criticalSignature;
    criticalSignature = nextCritical;
    page.setAttribute('aria-busy', String(busy));
    page.replaceChildren();
    if (resetAccountId) { renderReset(busy, currentFocus); return; }

    const header = element('div', 'account-header');
    const back = button('Back', 'accountBack', () => close());
    back.id = 'accountBack';
    back.setAttribute('aria-label', 'Back to chats');
    const heading = element('strong', '', 'Codex Accounts');
    heading.id = 'accountPageTitle';
    page.setAttribute('aria-labelledby', heading.id);
    header.append(back, heading);
    const refresh = button(state?.usageRefreshing ? 'Checking usage...' : 'Refresh usage', 'refreshUsage',
      () => post('refreshUsage', undefined, undefined, true),
      !state?.enabled || !state?.supported || !!state?.usageRefreshing);
    header.append(refresh);
    page.append(header);

    const content = element('div', 'account-content');
    if (!state) content.append(element('p', 'account-muted', 'Loading accounts...'));
    else {
      if ((!state.enabled || !state.supported || state.problem)
          && state.detail && String(state.detail).trim() !== String(state.problem || '').trim() && state.detail !== state.label) {
        content.append(element('p', 'account-detail', state.detail));
      }
      if (!state.enabled) {
        content.append(element('p', 'account-muted', 'Set up account switching to remember Codex sign-ins on this device.'));
        content.append(button('Set Up Account Switching', 'setupMain', () => post('setup'), busy));
      } else if (!state.supported) {
        content.append(element('p', 'account-muted', 'Account switching is unavailable in this Codex environment.'));
      }
      if (state.loginEmail) {
        const login = element('div', 'account-login');
        const loginEmail = String(state.loginEmail);
        const hasEmail = loginEmail.includes('@');
        login.append(element('strong', '', hasEmail ? 'Sign in to the expected account' : 'Sign in to your new account'));
        login.append(element('span', 'account-subtitle', loginEmail));
        if (hasEmail) {
          const copy = button('Copy Email', 'copyEmail', () => post('copyEmail'));
          copy.title = 'Copy this email address to paste into the browser sign-in form.';
          login.append(copy);
        }
        login.append(button('Cancel sign-in', 'cancelLogin', () => post('cancelLogin'), pendingAction));
        content.append(login);
      }
      if (busy) {
        const progress = element('p', 'account-progress',
          state.progress || (pendingAction ? pendingProgress : state.loginEmail ? 'Waiting for browser sign-in...' : 'Preparing account action...'));
        progress.setAttribute('role', 'status');
        content.append(progress);
      }
      if (state.problem) {
        const error = element('div', 'account-problem');
        const message = element('p', '', state.problem);
        message.setAttribute('role', 'alert');
        error.append(message);
        if (state.recovery) error.append(button('Restore Previous Account', 'restore', () => post('restore'), busy));
        if (state.reloadNeeded) error.append(button('Retry Reload', 'retryReload', () => post('retryReload'), busy));
        content.append(error);
      }
      const accounts = Array.isArray(state.accounts) ? state.accounts.filter(validAccount) : [];
      if (state.enabled && state.supported && !accounts.length) content.append(element('p', 'account-muted', 'No saved accounts yet.'));
      const grid = element('div', 'account-grid');
      grid.setAttribute('aria-label', 'Saved Codex accounts');
      for (const account of accounts) grid.append(renamingAccountId === account.id ? renameTile(account, busy) : accountTile(account, busy));
      if (state.enabled && state.supported) {
        const add = button('', 'add', () => post('add'), busy || !state.canAdd);
        add.className = 'account-tile account-add';
        add.setAttribute('aria-label', 'Add account. Sign in and switch.');
        add.append(element('span', 'account-label-row account-label', 'Add account'));
        add.append(element('span', 'account-name-row account-usage', 'Sign in and switch'));
        grid.append(add);
      }
      content.append(grid);
      if (contextAccountId) {
        const account = accounts.find(item => item.id === contextAccountId);
        if (account) {
          const menu = element('div', 'account-context');
          menu.setAttribute('role', 'menu');
          menu.setAttribute('aria-label', 'Account actions for ' + identity(account));
          menu.style.left = contextPosition.left + 'px';
          menu.style.top = contextPosition.top + 'px';
          menu.append(button('Change label', 'label:' + account.id, () => startRename(account), busy || !state.canSwitch));
          menu.append(button('Use banked reset', 'reset:' + account.id, () => {
            contextAccountId = undefined;
            resetAccountId = account.id;
            resetSeen = false;
            post('previewReset', account);
          }, busy || !state.canAdd || state.reloadNeeded));
          menu.append(button('Sign In Again', 'reconnect:' + account.id, () => {
            contextAccountId = undefined;
            post('reconnect', account);
          }, busy || !state.canAdd));
          menu.append(button('Forget', 'forget:' + account.id, () => {
            contextAccountId = undefined;
            post('forget', account);
          }, busy));
          content.append(menu);
        }
      }
    }
    page.append(content);
    content.scrollTop = criticalChanged ? 0 : scrollTop;
    resize();
    if (currentFocus) focus(currentFocus);
  }

  function resize() {
    if (page.hidden) return;
    const grid = page.querySelector('.account-grid');
    const content = page.querySelector('.account-content');
    if (!grid || !content || !grid.clientWidth) return;
    const fontSize = parseFloat(getComputedStyle(document.body).fontSize) || 13;
    const layout = navigatorLayout(grid.clientWidth, document.body.clientHeight, fontSize);
    grid.style.setProperty('--columns', layout.columns);
    grid.style.setProperty('--row-height', layout.rowHeight + 'px');
    page.dataset.layout = layout.mode;
    const items = [...grid.children];
    items.forEach((item, index) => {
      item.classList.toggle('separator-right', index % layout.columns !== layout.columns - 1 && index + 1 < items.length);
      item.classList.toggle('separator-bottom', index + layout.columns < items.length);
    });
    grid.style.gridAutoRows = '';
    if (items.length) {
      const natural = Math.max(...items.map(item => item.getBoundingClientRect().height));
      const available = Math.max(0, content.clientHeight - grid.offsetTop + content.offsetTop);
      const fitted = fittedRowHeight(available, Math.ceil(items.length / layout.columns), natural);
      grid.style.gridAutoRows = fitted + 'px';
    }
  }

  window.addEventListener('message', event => {
    if (event.data?.type === 'accounts') {
      state = event.data.state;
      stateAt = Date.now();
      pendingAction = false;
      if (state?.reset?.accountId === resetAccountId) resetSeen = true;
      if (resetAccountId && resetSeen && !state?.reset && !state?.busy) { resetAccountId = undefined; resetSeen = false; }
      render();
    } else if (event.data?.type === 'accountsOpen') open();
  });
  document.addEventListener('click', event => {
    if (!page.hidden && contextAccountId && !event.target.closest('.account-context, .account-tile')) {
      contextAccountId = undefined;
      render();
    }
  });
  document.addEventListener('keydown', event => {
    if (page.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (contextAccountId) { const id = contextAccountId; contextAccountId = undefined; render('switch:' + id); }
      else if (resetAccountId) cancelReset();
      else if (renamingAccountId) { const id = renamingAccountId; renamingAccountId = undefined; render('switch:' + id); }
      else close();
      return;
    }
    if (event.target.matches('input') || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const controls = [...page.querySelectorAll('button:not(:disabled), summary')].filter(node => node.getClientRects().length);
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % controls.length : (current - 1 + controls.length) % controls.length;
    event.preventDefault();
    controls[next].focus();
  }, true);
  return { close, resize, get active() { return !page.hidden; } };
}
