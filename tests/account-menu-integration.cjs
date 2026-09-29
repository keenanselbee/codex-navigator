'use strict';
const assert = require('node:assert/strict');

// Exercises Navigator's actual webview and toolbar command with metadata-only fixtures.
exports.run = async ({ vscode, companion, provider, probe, until }) => {
  const original = provider.accounts, calls = [];
  const first = { id: 'a'.repeat(32), generation: 1, name: '', email: 'first@example.invalid',
    workspace: 'Personal workspace', selected: true, plan: 'Plus',
    usage: { checkedAt: Date.now(), primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 3600 },
      secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 86400 }, bankedResets: 2 } };
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
  } };
  try {
    const initial = await probe();
    assert.equal(initial.display, 'none', 'hidden page does not cover chats');
    await vscode.commands.executeCommand('codexNavigator.accounts');
    await until(async () => !(await probe()).hidden, 'toolbar account command opens Accounts page');
    let result = await probe();
    assert.equal(result.chatHidden, true);
    assert.equal(result.rows, 2);
    assert.equal(result.add, true);
    assert.equal(result.selected, true);
    assert.equal(result.script, false);
    assert.ok(result.text.includes('<script>Work</script>'), 'metadata remains literal text');
    assert.ok(result.text.includes('first@example.invalid'), 'email is the default title');
    assert.ok(result.text.includes('Plus'), 'Plus stays distinct from Pro');
    assert.ok(result.text.includes('Pro 5x') && !result.text.includes('prolite'), 'Codex prolite displays as Pro 5x');
    assert.ok(!result.text.includes('Account management') && !result.text.includes('Remember Current')
      && !result.text.includes('Forget All'), 'removed account management actions are not relocated');
    assert.ok(result.text.includes('5h 75% left · week 60% left'));
    assert.ok(result.text.includes('unavailable'), 'missing usage is not presented as zero');
    assert.ok(result.title.includes('Banked resets: 2'));
    assert.ok(result.title.includes('Checked:'));
    assert.equal(result.restore, false); assert.equal(result.reload, false);
    assert.ok(!result.text.includes('Confirm Account')); assert.equal(result.fits, true);
    assert.equal(result.horizontalOverflow, false);
    assert.ok(result.gridColumns >= 1);
    await until(() => calls.some(call => call.action === 'refreshUsage'), 'page open requests usage');

    second.plan = 'pro'; await provider.publishAccounts();
    assert.ok((await probe()).text.includes('Pro 20x'), 'Pro 20x stays distinct from Pro 5x');
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
    state.busy = true; state.loginEmail = second.email; await provider.publishAccounts();
    assert.equal((await probe()).login, true);
    await click('copyEmail'); await click('cancelLogin');
    await until(() => calls.some(call => call.action === 'cancelLogin'), 'login can be cancelled while busy');
    state.busy = false; delete state.loginEmail; state.problem = 'Reload failed'; state.recovery = true; state.reloadNeeded = true;
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
