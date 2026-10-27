#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

// ponytail: one lock per OS user, across all profiles; split only if isolated profiles need parallel work.
const stateDir = path.resolve(process.env.DOUBAO_PEN_LOCK_DIR || path.join(os.homedir(), '.codex', 'locks', 'doubao-pen'));
const leaseFile = path.join(stateDir, 'lease.json');
const gateDir = path.join(stateDir, 'operation');
const emit = value => console.log(JSON.stringify(value));
const exists = file => fs.existsSync(file);

function status(ignoreOwnGate = false) {
  const operationBusy = !ignoreOwnGate && exists(gateDir);
  const result = { held: exists(leaseFile) || operationBusy, operationBusy, stateDir };
  if (exists(leaseFile)) {
    try {
      const lease = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
      result.owner = lease.owner;
      result.acquiredAt = lease.acquiredAt;
    } catch {
      result.needsRecovery = true;
    }
  }
  return result;
}

function requireOwner(token) {
  if (!token) throw new Error('A --token from acquire is required.');
  const lease = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
  if (typeof lease.token !== 'string' || lease.token !== token) throw new Error('Lock ownership does not match.');
}

async function guarded(action) {
  fs.mkdirSync(stateDir, { recursive: true });
  try {
    fs.mkdirSync(gateDir);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    emit({ ok: false, reason: 'busy', ...status() });
    return 75;
  }
  try {
    return await action();
  } finally {
    fs.rmdirSync(gateDir);
  }
}

function openCliEntry() {
  const explicit = process.env.DOUBAO_PEN_OPENCLI_JS;
  if (explicit) {
    if (!path.isAbsolute(explicit) || !exists(explicit)) throw new Error('DOUBAO_PEN_OPENCLI_JS must name an existing absolute JS entry path.');
    return explicit;
  }
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const packageDir of [path.join(directory, 'node_modules', '@jackwener', 'opencli'), path.resolve(directory, '../lib/node_modules/@jackwener/opencli')]) {
      const manifest = path.join(packageDir, 'package.json');
      if (!exists(manifest)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.opencli;
      if (bin && exists(path.resolve(packageDir, bin))) return path.resolve(packageDir, bin);
    }
    const command = path.join(directory, 'opencli');
    if (exists(command)) {
      const real = fs.realpathSync(command);
      if (/\.[cm]?js$/i.test(real)) return real;
    }
  }
  throw new Error('OpenCLI JS entry not found. Set DOUBAO_PEN_OPENCLI_JS to its installed bin entry.');
}

async function runOpenCli(args) {
  const [operation, ...rest] = args;
  if (!['new', 'send', 'read', 'status'].includes(operation)) throw new Error('Supported operations: new, send, read, status.');
  const cliArgs = ['doubao', operation];
  if (operation === 'send') {
    const singleLine = rest.length === 3 && rest[2] === '--single-line';
    if (rest[0] !== '--text-file' || (rest.length !== 2 && !singleLine)) throw new Error('send requires --text-file <UTF-8 file> [--single-line].');
    let text = fs.readFileSync(rest[1], 'utf8');
    // Some contenteditable composers expose different paragraph breaks on readback.
    // Opt in only for prose: keep the original file and preserve other whitespace.
    if (singleLine) text = text.replace(/^\uFEFF/, '').replace(/\r\n|[\r\n\u2028\u2029]/g, ' ');
    if (!text.trim()) throw new Error('The message file is empty.');
    cliArgs.push(text);
  } else if (rest.length) {
    throw new Error('This operation takes no additional arguments.');
  }
  cliArgs.push('--window', 'background', '-f', 'json');
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [openCliEntry(), ...cliArgs], { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`OpenCLI ended with signal ${signal}; retain the lease and reconcile the result.`));
      else resolve(code ?? 1);
    });
  });
}

async function main() {
  const [command, ...raw] = process.argv.slice(2);
  const separator = raw.indexOf('--');
  const optionArgs = separator < 0 ? raw : raw.slice(0, separator);
  const operationArgs = separator < 0 ? [] : raw.slice(separator + 1);
  const options = {};
  for (let i = 0; i < optionArgs.length; i += 2) {
    const key = optionArgs[i];
    if (!['--owner', '--token'].includes(key) || !optionArgs[i + 1] || options[key] !== undefined) throw new Error('Use --owner <label> or --token <token>.');
    options[key] = optionArgs[i + 1];
  }
  const expected = { acquire: '--owner', check: '--token', release: '--token', run: '--token', status: null };
  if (!Object.hasOwn(expected, command) || Object.keys(options).some(key => key !== expected[command]) || (command !== 'run' && operationArgs.length)) throw new Error('Commands: acquire --owner <label>, status, check/release --token <token>, run --token <token> -- <operation>.');
  if (command === 'status') {
    emit({ ok: true, ...status() });
    return 0;
  }
  return await guarded(async () => {
    if (command === 'acquire') {
      if (!options['--owner']?.trim() || options['--owner'].length > 200) throw new Error('A short --owner identifying this chat/task is required.');
      if (exists(leaseFile)) {
        emit({ ok: false, reason: 'busy', ...status(true) });
        return 75;
      }
      const lease = { owner: options['--owner'], token: randomUUID(), acquiredAt: new Date().toISOString() };
      fs.writeFileSync(leaseFile, JSON.stringify(lease), { flag: 'wx', mode: 0o600 });
      emit({ ok: true, ...lease, stateDir });
      return 0;
    }
    requireOwner(options['--token']);
    if (command === 'run') return await runOpenCli(operationArgs);
    if (command === 'release') fs.unlinkSync(leaseFile);
    emit({ ok: true, ...status(true) });
    return 0;
  });
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, reason: 'error', message: error.message, stateDir }));
  process.exitCode = 1;
}
