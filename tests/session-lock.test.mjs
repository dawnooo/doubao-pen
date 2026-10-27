import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'doubao-pen-lock-test-'));
const script = fileURLToPath(new URL('../scripts/session-lock.mjs', import.meta.url));
const fakeCli = path.join(directory, 'fake-opencli.mjs');
const entered = path.join(directory, 'entered');
const finish = path.join(directory, 'finish');
fs.writeFileSync(fakeCli, `
import fs from 'node:fs';
const args = process.argv.slice(2);
if (args[1] === 'new') {
  fs.writeFileSync(process.env.LOCK_TEST_ENTERED, 'yes');
  const end = Date.now() + 10000;
  while (!fs.existsSync(process.env.LOCK_TEST_FINISH)) {
    if (Date.now() > end) process.exit(91);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
if (args[1] === 'read') process.exit(17);
console.log(JSON.stringify(args));
`);
const env = { ...process.env, DOUBAO_PEN_LOCK_DIR: path.join(directory, 'state'), DOUBAO_PEN_OPENCLI_JS: fakeCli, LOCK_TEST_ENTERED: entered, LOCK_TEST_FINISH: finish };
function start(args, extraEnv = {}) {
  const child = spawn(process.execPath, [script, ...args], { env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const result = new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('exit', code => resolve({ code, stdout, stderr }));
  });
  return { child, result };
}
const run = (args, extraEnv) => start(args, extraEnv).result;
try {
  // Independent CLI processes must elect exactly one owner.
  const contenders = await Promise.all(Array.from({ length: 8 }, (_, i) => run(['acquire', '--owner', `chat-${i}`])));
  assert.equal(contenders.filter(item => item.code === 0).length, 1);
  assert(contenders.filter(item => item.code !== 0).every(item => item.code === 75));
  const winner = JSON.parse(contenders.find(item => item.code === 0).stdout);
  const token = winner.token;
  assert.equal((await run(['check', '--token', token])).code, 0);
  assert.equal((await run(['release', '--token', 'wrong-owner'])).code, 1);
  assert.equal((await run(['run', '--token', 'wrong-owner', '--', 'new'])).code, 1);
  assert.equal(fs.existsSync(entered), false);
  const current = JSON.parse((await run(['status'])).stdout);
  assert.equal(current.held, true);
  assert.equal(current.owner, winner.owner);
  assert.equal(current.token, undefined);

  // Literal Chinese/quotes/shell metacharacters survive a file-to-argv send.
  const message = '中文提纲\n"引号" $() & ; `内容`';
  const brief = path.join(directory, 'brief.txt');
  fs.writeFileSync(brief, message);
  const sent = await run(['run', '--token', token, '--', 'send', '--text-file', brief]);
  assert.equal(sent.code, 0);
  assert.deepEqual(JSON.parse(sent.stdout), ['doubao', 'send', message, '--window', 'background', '-f', 'json']);

  // Opt-in prose transport folds line endings without editing the source or other whitespace.
  const multilineProse = '\uFEFF第一段。\r\n\r\n第二段：\t甲  乙\r第三段。\n第四段。\u2028第五段。';
  fs.writeFileSync(brief, multilineProse);
  const compatible = await run(['run', '--token', token, '--', 'send', '--text-file', brief, '--single-line']);
  assert.equal(compatible.code, 0, compatible.stderr);
  assert.deepEqual(JSON.parse(compatible.stdout), ['doubao', 'send', '第一段。  第二段：\t甲  乙 第三段。 第四段。 第五段。', '--window', 'background', '-f', 'json']);
  assert.equal(fs.readFileSync(brief, 'utf8'), multilineProse);
  const preserved = await run(['run', '--token', token, '--', 'send', '--text-file', brief]);
  assert.equal(preserved.code, 0);
  assert.equal(JSON.parse(preserved.stdout)[2], multilineProse);
  assert.equal((await run(['run', '--token', token, '--', 'send', '--text-file', brief, '--unknown'])).code, 1);

  // The npm PATH resolver works without invoking a Windows shell shim.
  const prefix = path.join(directory, 'npm-bin');
  const packageDir = path.join(prefix, 'node_modules', '@jackwener', 'opencli');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ bin: { opencli: 'main.mjs' } }));
  fs.copyFileSync(fakeCli, path.join(packageDir, 'main.mjs'));
  const resolved = await run(['run', '--token', token, '--', 'status'], { DOUBAO_PEN_OPENCLI_JS: '', PATH: prefix });
  assert.equal(resolved.code, 0);
  assert.deepEqual(JSON.parse(resolved.stdout), ['doubao', 'status', '--window', 'background', '-f', 'json']);

  // A running browser command cannot be overlapped or released underneath it.
  const active = start(['run', '--token', token, '--', 'new']);
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(entered) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert(fs.existsSync(entered));
    assert.equal((await run(['release', '--token', token])).code, 75);
    assert.equal((await run(['run', '--token', token, '--', 'status'])).code, 75);
    assert.equal((await run(['acquire', '--owner', 'another-chat'])).code, 75);
  } finally {
    fs.writeFileSync(finish, 'yes');
    assert.equal((await active.result).code, 0);
  }
  // CLI errors retain the whole-task lease; age never grants ownership.
  assert.equal((await run(['run', '--token', token, '--', 'read'])).code, 17);
  const leasePath = path.join(env.DOUBAO_PEN_LOCK_DIR, 'lease.json');
  const old = JSON.parse(fs.readFileSync(leasePath, 'utf8'));
  old.acquiredAt = '2000-01-01T00:00:00Z';
  fs.writeFileSync(leasePath, JSON.stringify(old));
  assert.equal((await run(['acquire', '--owner', 'timeout-is-not-ownership'])).code, 75);
  const released = await run(['release', '--token', token]);
  assert.equal(released.code, 0);
  assert.equal(JSON.parse(released.stdout).held, false);
  const next = JSON.parse((await run(['acquire', '--owner', 'next-chat'])).stdout);
  assert.notEqual(next.token, token);
  assert.equal((await run(['release', '--token', token])).code, 1);
  assert.equal((await run(['release', '--token', next.token])).code, 0);

  // A crashed/incomplete operation fails closed instead of stealing the session.
  fs.mkdirSync(path.join(env.DOUBAO_PEN_LOCK_DIR, 'operation'));
  assert.equal((await run(['acquire', '--owner', 'after-crash'])).code, 75);
  fs.rmdirSync(path.join(env.DOUBAO_PEN_LOCK_DIR, 'operation'));
  fs.writeFileSync(leasePath, '{incomplete');
  assert.equal(JSON.parse((await run(['status'])).stdout).needsRecovery, true);
  assert.equal((await run(['acquire', '--owner', 'after-partial-write'])).code, 75);
  console.log('Passed: concurrency, ownership, guarded CLI, literal text, failure retention, and fail-closed recovery.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
