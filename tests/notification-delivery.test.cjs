'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { NotificationDelivery, findCodexNotificationSound } = require('../dist/notification-delivery');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-notification-'));
  const codex = path.join(root, 'Codex', 'resources', 'app', 'assets');
  const media = path.join(root, 'extension', 'media');
  fs.mkdirSync(codex, { recursive: true }); fs.mkdirSync(media, { recursive: true });
  const installed = path.join(codex, 'codex-notification.wav');
  const bundled = path.join(media, 'notification-balafon.wav');
  fs.writeFileSync(installed, 'installed'); fs.writeFileSync(bundled, 'bundled');
  return { root, codexAppPath: path.join(root, 'Codex'), extensionPath: path.join(root, 'extension'), installed, bundled };
}

test('installed Codex sound is discovered within a bounded app resource root', async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  assert.equal(await findCodexNotificationSound('linux', files.codexAppPath), files.installed);
  assert.equal(await findCodexNotificationSound('linux', path.join(files.root, 'missing')), undefined);
});

test('Windows notification passes untrusted title and message through environment, with silent toast', async () => {
  const calls = [], reports = [];
  const title = 'A "quoted" title; $(touch x)', message = '<xml>& special\nnext line';
  const delivery = new NotificationDelivery({ extensionPath: '/extension', platform: 'win32',
    report: value => reports.push(value),
    run: async (file, args, env) => { calls.push({ file, args, env }); return true; } });
  await delivery.deliver({ title, message, desktop: true, sound: false });
  assert.equal(calls.length, 1); assert.equal(calls[0].file, 'powershell.exe');
  assert.deepEqual(calls[0].args.slice(0, 4), ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden']);
  assert.equal(calls[0].env.CODEX_NAVIGATOR_TITLE, title);
  assert.equal(calls[0].env.CODEX_NAVIGATOR_MESSAGE, '<xml>& special next line');
  const script = Buffer.from(calls[0].args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /Get-StartApps/); assert.match(script, /silent', 'true/);
  assert.doesNotMatch(script, /quoted|touch x|special/);
  assert.deepEqual(reports, []);
});

test('Windows chat notifications use protocol activation with the resolved chat link', async () => {
  const calls=[], ids=[];
  const link='vscode://openai.chatgpt/local/00000000-0000-0000-0000-000000000001?windowId=7&test=quoted%22';
  const delivery=new NotificationDelivery({extensionPath:'/extension',platform:'win32',report:()=>{},
    chatLink:async id=>{ids.push(id);return link;},run:async(file,args,env)=>{calls.push({args,env});return true;}});
  await delivery.deliver({chatId:'chat-id',title:'Chat',message:'Question',desktop:true,sound:false});
  assert.deepEqual(ids,['chat-id']); assert.equal(calls[0].env.CODEX_NAVIGATOR_CHAT_LINK,link);
  const script=Buffer.from(calls[0].args.at(-1),'base64').toString('utf16le');
  assert.match(script,/SetAttribute\('activationType', 'protocol'\)/);
  assert.match(script,/SetAttribute\('launch', \$env:CODEX_NAVIGATOR_CHAT_LINK\)/);
  assert.doesNotMatch(script,/windowId=7/,'link is data, not PowerShell source');
  await delivery.deliver({title:'Preview',message:'Test',desktop:true,sound:false});
  assert.equal(calls[1].env.CODEX_NAVIGATOR_CHAT_LINK,'','preview never inherits another notification link');
});

test('failed link resolution retains notification delivery and focus is rechecked after resolution', async () => {
  const calls=[], reports=[]; let allowed=true;
  const delivery=new NotificationDelivery({extensionPath:'/extension',platform:'win32',report:m=>reports.push(m),
    chatLink:async()=>{throw Error('no resolver');},run:async(file,args,env)=>{calls.push(env);return true;}});
  await delivery.deliver({chatId:'chat',title:'Chat',message:'Ready',desktop:true,sound:false});
  assert.equal(calls[0].CODEX_NAVIGATOR_CHAT_LINK,''); assert.equal(reports.length,1);
  let lateCalls=0;
  const changed=new NotificationDelivery({extensionPath:'/extension',platform:'win32',report:()=>{},
    chatLink:async()=>{allowed=false;return 'vscode://openai.chatgpt/local/chat';},run:async()=>{lateCalls++;return true;}});
  await changed.deliver({chatId:'chat',title:'Chat',message:'Ready',desktop:true,sound:false,canDeliver:()=>allowed});
  assert.equal(lateCalls,0);
});

test('desktop and sound toggles are independent on Linux', async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const calls = [], reports = [];
  const delivery = new NotificationDelivery({ ...files, platform: 'linux', report: message => reports.push(message),
    run: async (file, args) => { calls.push({ file, args }); return file === 'notify-send' || file === 'paplay'; } });
  await delivery.deliver({ title: 'Chat', message: 'Ready', desktop: true, sound: false });
  assert.deepEqual(calls.map(call => call.file), ['notify-send']);
  assert.deepEqual(calls[0].args.slice(-2), ['Chat', 'Ready']);
  assert.ok(calls[0].args.includes('--hint=boolean:suppress-sound:true'));
  await delivery.deliver({ title: 'Chat', message: 'Ready', desktop: false, sound: true });
  assert.deepEqual(calls.map(call => call.file), ['notify-send', 'paplay']);
  assert.deepEqual(calls[1].args, [files.installed]); assert.deepEqual(reports, []);
});

test('sound priority reaches Linux theme and bundled fallback after installed sound fails', async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const calls = [], reports = [];
  const delivery = new NotificationDelivery({ ...files, platform: 'linux', report: value => reports.push(value),
    run: async (file, args) => { calls.push({ file, args }); return file === 'aplay' && args[0] === files.bundled; } });
  await delivery.deliver({ title: 'Chat', message: 'Ready', desktop: false, sound: true });
  assert.deepEqual(calls.map(call => call.file), ['paplay', 'aplay', 'canberra-gtk-play', 'paplay', 'aplay']);
  assert.deepEqual(calls[0].args, [files.installed]); assert.deepEqual(calls.at(-1).args, [files.bundled]);
  assert.deepEqual(reports, []);
});

test('Windows system sound follows installed Codex sound and does not require a bundled file', async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const scripts = [];
  const delivery = new NotificationDelivery({ ...files, platform: 'win32', report: () => {},
    run: async (_file, args) => { scripts.push(Buffer.from(args.at(-1), 'base64').toString('utf16le')); return scripts.length === 2; } });
  await delivery.deliver({ title: 'Chat', message: 'Ready', desktop: false, sound: true });
  assert.equal(scripts.length, 2); assert.match(scripts[0], /SoundPlayer/);
  assert.match(scripts[1], /HKCU:\\AppEvents\\Schemes\\Apps\\\.Default\\Notification.Default\\\.Current/);
  assert.match(scripts[1], /Media\\Windows Notify System Generic.wav/);
});

test('failed commands and playback report failures without throwing or claiming success', async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const reports = [];
  const delivery = new NotificationDelivery({ ...files, platform: 'linux', report: message => reports.push(message),
    run: async () => { throw new Error('command unavailable'); } });
  await delivery.deliver({ title: 'Chat', message: 'Question', desktop: true, sound: true });
  assert.equal(reports.length, 2);
  assert.match(reports[0], /could not show/); assert.match(reports[1], /could not play/);
});

test('delivery stops after an asynchronous desktop command when chat becomes active', async () => {
  const calls = [], reports = [];
  let canDeliver = true;
  const delivery = new NotificationDelivery({ extensionPath: '/extension', platform: 'linux',
    report: value => reports.push(value),
    run: async file => { calls.push(file); canDeliver = false; return false; } });
  await delivery.deliver({ title: 'Chat', message: 'Ready', desktop: true, sound: true, canDeliver: () => canDeliver });
  assert.deepEqual(calls, ['notify-send']); assert.deepEqual(reports, []);
});

test('title and message are bounded and strip control characters', async () => {
  const calls = [];
  const delivery = new NotificationDelivery({ extensionPath: '/extension', platform: 'linux',
    report: () => {},
    run: async (_file, args) => { calls.push(args); return true; } });
  await delivery.deliver({ title: ' T\0\r' + 'x'.repeat(500), message: '\n' + 'y'.repeat(1000), desktop: true, sound: false });
  assert.equal(calls[0].at(-2).length, 200); assert.equal(calls[0].at(-1).length, 500);
  assert.doesNotMatch(calls[0].at(-2), /[\x00-\x1f\x7f]/);
});

test('Linux does not retry another player after focus returns', async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  let active = true; const calls = [];
  const delivery = new NotificationDelivery({ ...files, platform: 'linux', report: () => {},
    run: async file => { calls.push(file); active = false; return false; } });
  await delivery.deliver({ title: 'Chat', message: 'Ready', desktop: false, sound: true, canDeliver: () => active });
  assert.deepEqual(calls, ['paplay']);
});

test('macOS passes notification text as arguments and plays the installed WAV', async t => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const calls = [];
  const delivery = new NotificationDelivery({ ...files, platform: 'darwin', report: () => {},
    run: async (file, args) => { calls.push({ file, args }); return true; } });
  await delivery.deliver({ title: 'Chat "quoted"', message: 'Ready', desktop: true, sound: true });
  assert.deepEqual(calls.map(call => call.file), ['osascript', 'afplay']);
  assert.deepEqual(calls[0].args.slice(-3), ['--', 'Chat "quoted"', 'Ready']);
  assert.deepEqual(calls[1].args, [files.installed]);
});

test('delivery rechecks sound and desktop eligibility independently', async t => {
  const files=fixture(); t.after(() => fs.rmSync(files.root,{recursive:true,force:true}));
  for (const allowed of ['sound','desktop']) {
    const calls=[];
    const delivery=new NotificationDelivery({...files,platform:'linux',report:()=>{},run:async file=>{calls.push(file);return true;}});
    await delivery.deliver({title:'Chat',message:'Ready',sound:true,desktop:true,canDeliver:channel=>channel===allowed});
    assert.deepEqual(calls,allowed==='sound'?['paplay']:['notify-send']);
  }
  let desktop=true; const calls=[];
  const delivery=new NotificationDelivery({...files,platform:'linux',report:()=>{},run:async file=>{calls.push(file);desktop=false;return true;}});
  await delivery.deliver({title:'Chat',message:'Ready',sound:true,desktop:true,canDeliver:channel=>channel==='sound'||desktop});
  assert.deepEqual(calls,['notify-send','paplay'],'returning focus does not cancel an always-enabled sound');
});
