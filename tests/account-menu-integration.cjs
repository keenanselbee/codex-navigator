'use strict';
const assert = require('node:assert/strict');
const { resetEligibility } = require('../dist/account-usage');

// Exercises Navigator's actual webview and toolbar command with metadata-only fixtures.
exports.run = async ({ vscode, companion, provider, probe, until }) => {
  const original = provider.accounts, calls = [];
  const first = { id: 'a'.repeat(32), generation: 1, name: '', email: 'first@example.invalid',
    workspace: 'Personal workspace', selected: true, plan: 'Plus',
    usage: { checkedAt: Date.now(), primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 3600 },
      secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 86400 }, bankedResets: 2,
      bankedResetExpiresAt: Math.floor(Date.now() / 1000) + 86400 } };
  const second = { id: 'b'.repeat(32), generation: 2, name: '<script>Work</script>', email: 'second@example.invalid',
    workspace: 'Work workspace', selected: false, plan: 'prolite' };
  const state = { enabled: true, supported: true, label: 'Remembering accounts',
    detail: 'Choose an account to switch and reload this window.', count: 2,
    accounts: [first, second], busy: false, canSwitch: true, canAdd: true, recovery: false, reloadNeeded: false };
  const send = message => companion.webview.postMessage(message);
  const click = key => send({ type: 'fixture:click', selector: '[data-account-focus="' + key + '"]' });
  const key = value => send({ type: 'fixture:key', selector: '#accountPage', key: value });
  const menu = key => send({ type: 'fixture:menu', selector: '[data-account-focus="' + key + '"]' });
  provider.accounts = { snapshot: () => state, refresh: async () => provider.publishAccounts(), act: async message => {
    calls.push(message);
    if (message.action === 'rename') second.name = message.label;
    if (message.action === 'previewReset') {
      state.reset = { accountId: message.id, token: 'confirmation-fixture', usage: first.usage,
        eligibility: resetEligibility(first.usage), expiresAt: [1, 8, 24].map(days => Math.floor(Date.now() / 1000) + days * 86400) };
      await provider.publishAccounts();
    }
    if (message.action === 'cancelReset') { delete state.reset; await provider.publishAccounts(); }
  } };
  try {
    const initial = await probe();
    assert.equal(initial.display, 'none', 'hidden page does not cover chats');
    await vscode.commands.executeCommand('codexNavigator.accounts');
    await until(async () => !(await probe()).hidden, 'toolbar account command opens Accounts page');
    await vscode.commands.executeCommand('codexNavigator.accounts');
    assert.equal((await probe()).hidden, false, 'repeated open requests keep Accounts visible');
    let result = await probe();
    assert.equal(result.chatHidden, true);
    assert.equal(result.rows, 2);
    assert.equal(result.add, true);
    assert.equal(result.selected, true);
    assert.equal(result.script, false);
    assert.ok(result.text.includes('<script>Work</script>'), 'metadata remains literal text');
    assert.ok(result.text.includes('first@example.invalid'), 'email is the default title');
    assert.ok(result.text.includes('Plus'), 'Plus stays distinct from Pro');
    assert.ok(result.text.includes('Pro 100') && !result.text.includes('prolite'), 'Codex prolite displays as Pro 100');
    assert.ok(!result.text.includes('Account management') && !result.text.includes('Remember Current')
      && !result.text.includes('Forget All'), 'removed account management actions are not relocated');
    assert.ok(result.text.includes('5h 75% left · week 60% left'));
    assert.ok(result.text.includes('unavailable'), 'missing usage is not presented as zero');
    assert.ok(result.title.includes('Banked resets: 2'));
    assert.ok(result.title.includes('expiry: '));
    assert.ok(result.title.includes(new Date(first.usage.bankedResetExpiresAt * 1000).toLocaleString(undefined,
      { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
    assert.ok(result.title.includes('Checked:'));
    const secondary = first.usage.secondary;
    delete first.usage.secondary;
    await provider.publishAccounts();
    assert.doesNotMatch((await probe()).title, /Other window|remaining: unavailable|reset: unavailable/);
    first.usage.secondary = { usedPercent: 0 };
    await provider.publishAccounts();
    assert.match((await probe()).title, /Other window remaining: 100% left/);
    assert.doesNotMatch((await probe()).title, /Other window reset:/);
    first.usage.secondary = secondary;
    await provider.publishAccounts();
    assert.equal(result.restore, false); assert.equal(result.reload, false);
    assert.ok(!result.text.includes('Confirm Account')); assert.equal(result.fits, true);
    assert.equal(result.horizontalOverflow, false);
    assert.ok(result.gridColumns >= 1);
    await until(() => calls.some(call => call.action === 'refreshUsage'), 'page open requests usage');
    await until(() => calls.some(call => call.action === 'retryUsage'), 'visible Accounts retries missing usage after ten seconds');

    second.plan = 'pro'; await provider.publishAccounts();
    assert.ok((await probe()).text.includes('Pro 200'), 'Pro 200 stays distinct from Pro 100');
    second.plan = 'promax'; await provider.publishAccounts();
    assert.ok((await probe()).text.includes('Pro 500'), 'Codex promax displays as Pro 500');
    second.plan = 'future_plan'; await provider.publishAccounts();
    assert.ok((await probe()).text.includes('future_plan'), 'new plan identifiers display directly without guessing a tier');
    second.plan = 'prolite'; await provider.publishAccounts();

    await click('refreshUsage');
    await until(() => calls.some(call => call.action === 'refreshUsage' && call.force === true), 'explicit refresh forces usage');
    await menu('switch:' + second.id);
    assert.equal((await probe()).context, true);
    await click('label:' + second.id);
    await send({ type: 'fixture:input', selector: '.account-rename', value: 'Work renamed' });
    await provider.publishAccounts();
    await click('save:' + second.id);
    await until(() => calls.some(call => call.action === 'rename'), 'inline label delivered');
    assert.equal(calls.find(call => call.action === 'rename').label, 'Work renamed');
    await provider.publishAccounts();
    assert.ok((await probe()).text.includes('Work renamed'));

    await menu('switch:' + second.id); await click('label:' + second.id);
    await send({ type: 'fixture:input', selector: '.account-rename', value: ' ' });
    await click('save:' + second.id);
    await until(() => calls.filter(call => call.action === 'rename').length === 2, 'blank label clears custom name');
    assert.equal(calls.filter(call => call.action === 'rename')[1].label, '');
    await provider.publishAccounts();
    assert.ok((await probe()).text.includes('second@example.invalid'));

    await click('switch:' + second.id);
    await until(() => calls.some(call => call.action === 'switch'), 'tile selection delivered');
    assert.equal(calls.find(call => call.action === 'switch').generation, 2);
    state.busy = true; state.progress = 'Checking sign-in for Work...'; await provider.publishAccounts();
    assert.ok((await probe()).text.includes(state.progress));
    state.loginEmail = 'your new account'; state.progress = 'Waiting for browser sign-in...';
    await provider.publishAccounts();
    assert.ok((await probe()).text.includes(state.progress));
    assert.ok(!(await probe()).text.includes('Copy Email'));
    state.loginEmail = second.email; await provider.publishAccounts();
    assert.equal((await probe()).login, true);
    assert.ok((await probe()).text.includes('Copy Email'));
    await click('copyEmail'); await click('cancelLogin');
    await until(() => calls.some(call => call.action === 'cancelLogin'), 'login can be cancelled while busy');
    state.busy = false; delete state.loginEmail; delete state.progress; state.problem = 'Reload failed'; state.recovery = true; state.reloadNeeded = true;
    await provider.publishAccounts(); result = await probe();
    assert.equal(result.restore, true); assert.equal(result.reload, true); assert.equal(result.problem, true);
    await send({ type: 'fixture:size', width: 600, height: 120 });
    assert.equal((await probe()).criticalVisible, true, 'recovery stays visible in a short panel');
    await send({ type: 'fixture:resetSize' });
    delete state.problem; state.recovery = false; state.reloadNeeded = false; await provider.publishAccounts();
    await key('Escape'); result = await probe();
    assert.equal(result.hidden, true); assert.equal(result.display, 'none');
    assert.equal(result.chatHidden, initial.chatHidden, 'Back restores the previous page');
    await until(() => calls.some(call => call.action === 'cancelUsage'), 'closing cancels optional usage read');
    await vscode.commands.executeCommand('codexNavigator.accounts');
    await until(async () => !(await probe()).hidden, 'Accounts page can reopen without replacing chat state');
    for (const [width, height] of [[600, 120], [600, 168], [320, 240]]) {
      await send({ type: 'fixture:size', width, height });
      result = await probe();
      assert.ok(result.pageRect.left >= 0 && result.pageRect.right <= width + 1
        && result.pageRect.top >= 0 && result.pageRect.bottom <= height + 1,
      width + 'x' + height + ' page fits the assigned panel size');
      assert.equal(result.horizontalOverflow, false, width + 'x' + height + ' has no horizontal overflow');
      assert.equal(result.addVisible, true, width + 'x' + height + ' Add tile is visible');
      assert.ok(result.accountHeight >= 28, width + 'x' + height + ' uses readable tile height');
      await menu('switch:' + second.id);
      assert.equal((await probe()).contextFits, true, width + 'x' + height + ' context menu fits');
      await key('Escape');
    }
    await send({ type: 'fixture:size', width: 600, height: 120 });
    await menu('switch:' + second.id); await click('label:' + second.id);
    await send({ type: 'fixture:input', selector: '.account-rename', value: 'Keyboard label' });
    await send({ type: 'fixture:key', selector: '.account-rename', key: 'Enter' });
    await until(() => calls.filter(call => call.action === 'rename').length === 3, 'narrow-pane keyboard rename works');
    assert.equal(calls.filter(call => call.action === 'rename')[2].label, 'Keyboard label');
    await provider.publishAccounts();
    await send({ type: 'fixture:resetSize' });
    await menu('switch:' + first.id); await click('reset:' + first.id);
    await until(async () => (await probe()).resetCredits === 3, 'reset confirmation replaces accounts');
    result = await probe();
    assert.equal(result.resetDisabled, true);
    assert.ok(result.text.includes('Reset unavailable') && result.text.includes('Next to expire'));
    assert.ok(result.text.includes('Requires less than 10% left in either window.'));
    await click('useReset');
    assert.equal(calls.some(call => call.action === 'useReset'), false, 'disabled action cannot submit');
    first.usage.primary.usedPercent = 90;
    await click('refreshReset');
    await until(async () => (await probe()).text.includes('10% left'), 'fresh usage at boundary');
    assert.equal((await probe()).resetDisabled, true, '10% remaining is unavailable');
    first.usage.secondary.usedPercent = 90.01;
    await click('refreshReset');
    await until(async () => (await probe()).resetDisabled === false, 'weekly window unlocks reset');
    assert.ok((await probe()).text.includes('<10% left'), 'eligible fractional usage is not rounded to the blocked boundary');
    const knownUsage = first.usage;
    first.usage = undefined; await click('refreshReset');
    await until(async () => (await probe()).text.includes('Refresh usage to check eligibility.'), 'unknown quota asks for refresh');
    assert.equal((await probe()).resetCredits, 3);
    assert.equal((await probe()).resetDisabled, true);
    first.usage = knownUsage;
    first.usage.primary.usedPercent = 96; first.usage.secondary.usedPercent = 40;
    await click('refreshReset');
    await until(async () => (await probe()).resetDisabled === false, 'five-hour window unlocks reset');
    result = await probe();
    assert.equal(result.rows, 0); assert.equal(result.resetDisabled, false);
    assert.ok(result.text.includes('Will be used') && result.text.includes(first.email));
    assert.ok(result.text.includes('Resets 5-hour + weekly limits; moves weekly reset date.'));
    const secondEmail = second.email;
    second.email = first.email; await provider.publishAccounts();
    assert.ok((await probe()).text.includes(first.workspace), 'same-email confirmation distinguishes workspace');
    second.email = secondEmail;
    state.reset.retry = true; state.reset.eligibility = 'unavailable'; state.reset.expiresAt = [];
    await provider.publishAccounts();
    assert.equal((await probe()).resetDisabled, false, 'pending reset can be resolved after replenishment with no remaining credits');
    assert.ok((await probe()).text.includes('Retry previous reset'));
    await click('refreshReset');
    await until(async () => (await probe()).resetCredits === 3, 'restore normal confirmation');
    assert.ok(!result.text.includes('Expires first') && !result.text.includes('3 available') && !result.text.includes('Expiration dates'));
    assert.deepEqual(result.resetButtons, process.platform === 'win32' ? ['Use banked reset', 'Cancel'] : ['Cancel', 'Use banked reset']);
    for (const [width, height] of [[704, 120], [600, 120], [704, 182], [320, 240]]) {
      await send({ type: 'fixture:size', width, height });
      result = await probe(); assert.equal(result.horizontalOverflow, false, 'reset confirmation fits width ' + width);
      assert.ok(result.pageRect.bottom <= height + 1);
      assert.equal(result.resetDatesVisible, true, width + 'x' + height + ' shows every reset date without scrolling');
      assert.equal(result.resetActionsVisible, true, width + 'x' + height + ' keeps confirmation actions visible');
      assert.ok(result.gridScrollHeight <= result.gridClientHeight + 1, width + 'x' + height + ' needs no reset content scrolling');
    }
    await click('cancelReset');
    await until(async () => (await probe()).rows === 2, 'Cancel returns to accounts');
    assert.equal(calls.some(call => call.action === 'useReset'), false);
    await menu('switch:' + first.id); await click('reset:' + first.id);
    await until(async () => (await probe()).resetCredits === 3, 'reset confirmation reopens');
    await click('useReset'); await click('useReset');
    await until(() => calls.some(call => call.action === 'useReset'), 'confirmation delivered');
    assert.equal(calls.filter(call => call.action === 'useReset').length, 1);
    assert.equal(calls.find(call => call.action === 'useReset').token, 'confirmation-fixture');
    state.busy = true; state.progress = 'Using banked reset...'; await provider.publishAccounts();
    assert.equal((await probe()).resetDisabled, true);
    delete state.reset; await provider.publishAccounts();
    state.busy = false; delete state.progress; await provider.publishAccounts();
    await until(async () => (await probe()).rows === 2, 'success returns to refreshed accounts');
    await send({ type: 'fixture:resetSize' });
    state.canSwitch = false; state.canAdd = false; await provider.publishAccounts();
    await menu('switch:' + second.id);
    await click('forget:' + second.id);
    await until(() => calls.some(call => call.action === 'forget'), 'Forget remains reachable when switching is disabled');
    state.canSwitch = true; state.canAdd = true; await provider.publishAccounts();
    await click('add');
    await until(() => calls.some(call => call.action === 'add'), 'final grid tile starts Add account');
  } finally {
    await send({ type: 'fixture:resetSize' });
    await key('Escape'); provider.accounts = original; await provider.publishAccounts();
  }
};
