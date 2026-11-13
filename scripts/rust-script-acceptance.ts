/** P2/P27/P29 + H2 mechanics. Real production backend, shipped eight-node Map,
 * installed native manager tools/adapters, real material files and complete readback.
 * Only external guide writers/provider/Herdr are controlled. Not H1/H2 approval.
 * Oracle: abc, hello, empty and literal digests; a stub save, implicit completion,
 * wrong binding, dropped partial effect or reused execution cannot pass.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { dualRoleDock } from '../tests/workflow-chat/support/dual-role-dock';
import { providerMessages } from '../tests/workflow-chat/support/prompt-dock';
import { ensureIsolatedHarness } from '../tests/harness-dock/baseline';

function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected actual object');
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] { assert(Array.isArray(value), 'Expected actual list'); return value; }
function at(value: unknown, ...keys: string[]): unknown { return keys.reduce<unknown>((current, key) => object(current)[key], value); }
function text(value: unknown): string { assert.equal(typeof value, 'string'); return value as string; }
function json(file: string): unknown { return JSON.parse(readFileSync(file, 'utf8')); }
function save(file: string, value: unknown): void { writeFileSync(file, JSON.stringify(value, null, 2)); }
async function until<T>(observe: () => Promise<T | undefined>, label: string, budget = 10_000): Promise<T> {
  const deadline = performance.now() + budget;
  do { const value = await observe(); if (value !== undefined) return value; await Bun.sleep(20); } while (performance.now() < deadline);
  throw new Error(`Observation budget ${budget}ms exceeded: ${label}`);
}
const { values } = parseArgs({ args: Bun.argv.slice(2), options: {
  'herdr-bot-worktree': { type: 'string' }, 'isolation-config': { type: 'string' }, 'evidence-dir': { type: 'string' },
} });
const source = resolve(text(values['herdr-bot-worktree']));
const destination = resolve(text(values['evidence-dir']));
assert(!existsSync(destination), 'Never overwrite evidence');
mkdirSync(destination, { recursive: true });
const isolation = object(json(resolve(text(values['isolation-config']))));
assert.equal(isolation.externalMode, 'controlled-protocol-only');
const evidence: { passed: boolean; scenarios: Record<string, unknown>[]; cleanupErrors: string[]; human: Record<string, string> } = {
  passed: false, scenarios: [], cleanupErrors: [], human: { H1: 'unverified: user must operate authorized real manager', H2: 'unverified: controlled provider does not prove manager understanding' },
};
// Existing browser infrastructure owns production process startup, numeric loopback,
// fixture identity, log consumption, tree termination and process-exit confirmation.
const { startServer } = await import(pathToFileURL(join(source, 'frontend/browser-tests/support.ts')).href);
const { scriptFileGate } = await import(pathToFileURL(join(source, 'frontend/browser-tests/scriptFileGate.ts')).href);
type Backend = { baseURL: string; cwd: string; configPath: string; storageFile: string;
  setHerdrBehavior(value: unknown): void; herdrCalls(): Record<string, unknown>[]; herdrTabs(): unknown[];
  diagnostics(): string; cleanup(): Promise<void> };
const nativeIdentity = await ensureIsolatedHarness();
save(join(destination, 'native-installation.json'), {
  omp: nativeIdentity, piCli: isolation.piCli, piNode: isolation.piNode, bun: Bun.version,
  entryHashes: Object.fromEntries([nativeIdentity.cliPath, text(isolation.piCli), text(isolation.piNode), process.execPath].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])),
});

async function scenario(host: 'omp' | 'pi', partial: boolean): Promise<void> {
  const name = `${host}-${partial ? 'partial-save-retry' : 'shipped-map'}`;
  const dir = join(destination, name); mkdirSync(dir);
  const envKeys = ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'OMP_CODING_AGENT_DIR', 'PI_CODING_AGENT_DIR'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const record: Record<string, unknown> = { host, partial, passed: false, processesExited: false, http: [], native: [] };
  evidence.scenarios.push(record);
  let server: Backend | undefined;
  let closeDock: (() => Promise<void>) | undefined;
  try {
    for (const key of envKeys) { process.env[key] = join(dir, key); mkdirSync(process.env[key]!); }
    server = await startServer({ separateCwd: true, herdr: {} });
    assert(server, 'Production backend startup returned no process owner');
    const backend = server;
    writeFileSync(join(dirname(server.configPath), 'prompts.local.toml'), `herdr-bot-path = ${JSON.stringify(source.replace(/\\/g, '/'))}\nherdr-bot-api-url = ${JSON.stringify(server.baseURL)}\n`);
    async function http(route: string, body?: unknown, expected = 200): Promise<unknown> {
      const response = await fetch(backend.baseURL + route, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const raw = await response.text();
      list(record.http).push({ route, body, status: response.status, raw });
      assert.equal(response.status, expected, raw);
      return JSON.parse(raw);
    }
    const native = await dualRoleDock(host, server.baseURL);
    closeDock = () => native.close();
    const state = await native.session.request({ type: 'get_state' });
    const manager = text(at(state, 'data', 'sessionId'));
    record.manager = manager;
    async function call(tool: string, params: unknown, error = false): Promise<unknown> {
      const result = await native.call(tool, params);
      list(record.native).push({ tool, params, result });
      assert.equal(result.isError, error, JSON.stringify(result));
      if (!error && tool === 'run' && at(params, 'action') === 'dispatch') {
        for (const item of list(at(result.body, 'results'))) assert.equal(at(item, 'status'), 'running', JSON.stringify(item));
      }
      return result.body;
    }
    const zone = join(server.cwd, 'bot-playground'); mkdirSync(zone);
    await http('/api/zones', { id: 'acceptance/zone', path: zone });
    const tasks: Record<string, string> = {};
    for (const [name, taskType] of [['manager', 'manager'], ['worker', 'normal'], ['literal-target', 'normal']]) {
      const result = await http('/api/tasks', { name, taskType, agent: name === 'manager' ? host : 'omp', chatName: '{chat.id}', model: 'default', thinking: 'default', prompt: 'Read only isolated acceptance. Never execute target business.' });
      tasks[name!] = text(at(list(at(result, 'tasks')).find(task => at(task, 'name') === name), 'id'));
    }
    const target = at(await http(`/api/tasks/${tasks['literal-target']}`), 'task');
    const locator = { type: 'task', task_id: tasks['literal-target'] };
    const request = { schema_version: 1, kind: 'request', target: locator, bot: { id: 'native-result', name: 'Literal native result' }, requirements: 'Only read invoices', constraints: ['Do not execute target'], non_goals: [], resource_limits: [], authorization: { create_blank: true, write_materials: true, save_guides: false }, confirmation: { scope: 'create_blank', evidence: 'Explicit isolated acceptance authorization' } };
    const requestPath = join(zone, 'request.json'); save(requestPath, request);
    for (const tree of ['bots', 'workflow-maps']) cpSync(join(source, 'meta-data', tree), join(server.cwd, 'meta-data', tree), { recursive: true });
    // Retain all shipped Map nodes/rules/dependencies; relocate only physical zones
    // and controlled external writer bindings, just like owner 07's S1 deployment.
    for (const file of readdirSync(join(server.cwd, 'meta-data/bots'))) {
      const path = join(server.cwd, 'meta-data/bots', file);
      const bot = object(json(path));
      if (['write-bot-when', 'write-bot-plan-guide', 'write-bot-node-guide', 'optimize-prompt'].includes(text(bot.id))) { bot.task_id = tasks.worker; save(path, bot); }
    }
    const mapFile = join(server.cwd, 'meta-data/workflow-maps/create-bot-wrapper.json');
    const map = object(json(mapFile));
    for (const node of Object.values(object(map.nodes))) object(node).zone = 'acceptance/zone';
    save(mapFile, map);
    assert.deepEqual(await http('/api/scheduler/maps/create-bot-wrapper.json'), map);
    server.setHerdrBehavior({ native_session: { source: `herdr:${host}`, agent: host, kind: 'id', value: manager }, native_cwd: zone });
    const run = await http('/api/scheduler/maps/create-bot-wrapper.json/runs', { managerTaskId: tasks.manager, zone: 'acceptance/zone', userInput: 'Explicit literal creation only', fileInputs: [{ id: 'request', path: requestPath }] }, 201);
    const runId = text(at(run, 'id')); record.runId = runId;
    await call('run', { action: 'prepare_inputs', confirmed: true, reason: 'Read exact request; permission is limited to isolated definitions', fileInputs: [{ id: 'request', path: requestPath }] });
    async function fact(): Promise<unknown> { return http(`/api/workflow/runs/${runId}`); }
    async function report(node: string, execution?: string): Promise<unknown> {
      return until(async () => list(at(await fact(), 'reports')).find(item => at(item, 'nodeId') === node && (!execution || at(item, 'executionId') === execution)), `${node} automatic report`);
    }
    async function complete(node: string): Promise<void> {
      await call('run', { action: 'complete', nodeId: node, reason: 'Actual named files and complete readback; deterministic report permits handoff' });
      const completed = at(await fact(), 'run', 'nodes', node);
      assert.equal(at(completed, 'status'), 'completed');
      assert.equal(at(completed, 'completion', 'actor', 'sessionId'), manager);
      assert(text(at(completed, 'completion', 'id')).length > 0);
      if (at(completed, 'execution', 'autoClose') === true) {
        // A public completion may precede the external close record's publication.
        // Establish that prior Task effect before measuring the next script's calls.
        const tab = text(at(completed, 'execution', 'chat', 'tabId'));
        await until(async () => backend.herdrCalls().some(item => item.kind === 'tab_close' && item.target === tab) ? true : undefined, 'prior Task close record published');
      }
    }
    function output(report: unknown, id: string): string { return text(at(list(at(report, 'outputs')).find(item => at(item, 'id') === id), 'path')); }
    async function nativeRead(file: string, literal: string): Promise<void> {
      await call('read', { path: file });
      const messages = providerMessages(native.capture.requests().slice(-1)[0]!);
      assert(messages.some(message => message.role === 'tool' && message.content.includes(literal)), 'Actual native reader result must reach subsequent provider context');
    }
    const callsBefore = server.herdrCalls().length, tabsBefore = server.herdrTabs().length;
    const dispatched = await call('run', { action: 'dispatch', nodes: ['create_blank'] });
    assert.equal(at(dispatched, 'results') !== undefined, true);
    const created = await report('create_blank'); assert.equal(at(created, 'canComplete'), true);
    await until(async () => backend.herdrCalls().some(item => item.kind === 'agent_prompt' && typeof item.text === 'string' && item.text.includes(text(at(created, 'id')))) ? true : undefined, 'created report external notification');
    assert.equal(at(created, 'to', 'sessionId'), manager);
    const baselineBytes = readFileSync(output(created, 'baseline'));
    const baseline = json(output(created, 'baseline'));
    assert.deepEqual(at(baseline, 'request'), request);
    assert.deepEqual(at(baseline, 'target', 'configuration'), target);
    const blank = { id: 'native-result', name: 'Literal native result', when: '', plan_guide: '', node_guide: '', task_id: tasks['literal-target'] };
    assert.deepEqual(at(baseline, 'bot'), blank);
    assert.deepEqual(at(json(output(created, 'handoff')), 'checks'), { bot_read_back: true, target_unchanged: true });
    assert.equal(at(created, 'from'), null);
    assert.deepEqual(at(created, 'source'), { kind: 'rust_script', rustScript: 'create_blank_bot' });
    assert.equal(at(await fact(), 'run', 'nodes', 'create_blank', 'status'), 'running');
    assert.equal(server.herdrTabs().length, tabsBefore, 'Rust creates no Tab');
    assert(server.herdrCalls().slice(callsBefore).every(item => item.kind === 'agent_prompt'), 'Rust only notifies existing manager');
    await call('collect', {}); await nativeRead(output(created, 'baseline'), 'Literal native result');
    await complete('create_blank');
    const texts = [['when', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'], ['plan_guide', 'hello', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'], ['node_guide', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855']] as const;
    for (const [field, body, digest] of texts) {
      let previousHandoff: unknown;
      for (const stage of ['write', 'optimize']) {
        const node = `${stage}_${field}`, sessionId = `external-${node}`;
        server.setHerdrBehavior({ native_session: { source: 'herdr:omp', agent: 'omp', kind: 'id', value: sessionId }, native_cwd: zone, consume_named_files: true });
        await call('run', { action: 'dispatch', nodes: [node] });
        const consumedFile = join(dirname(server.configPath), 'herdr/consumed.jsonl');
        const consumed = JSON.parse(readFileSync(consumedFile, 'utf8').trim().split('\n').slice(-1)[0]!);
        assert.deepEqual(JSON.parse(text(at(consumed, 'files', 'baseline'))), baseline);
        if (stage === 'optimize') { assert.equal(at(consumed, 'files', 'text'), body); assert.deepEqual(JSON.parse(text(at(consumed, 'files', 'handoff'))), previousHandoff); }
        const textPath = join(zone, `${node}.txt`), handoffPath = join(zone, `${node}.json`);
        writeFileSync(textPath, body);
        const handoff = { schema_version: 1, kind: 'handoff', stage: 'guide', bot_id: 'native-result', target: locator, field, sources: [
          { binding_id: 'baseline', direction: 'input', role: 'baseline' }, { binding_id: 'text', direction: 'output', role: 'text' },
          ...(stage === 'optimize' ? [{ binding_id: 'text', direction: 'input', role: 'text' }, { binding_id: 'handoff', direction: 'input', role: 'handoff' }] : []),
        ], confirmation: { evidence: `Controlled literal final ${field} approval for protocol testing only`, text_sha256: digest, full_text: true, save_authorized: true, semantics_preserved: true }, constraints: ['Do not execute target'], unverified: ['No claim of real model compliance'] };
        save(handoffPath, handoff);
        await http('/api/workflow/node/report', { sessionId, body: 'Controlled external writer result; not real model evidence', canComplete: true, outputs: [{ id: 'text', path: textPath }, { id: 'handoff', path: handoffPath }] });
        await complete(node); previousHandoff = handoff;
      }
    }
    const saveCallsBefore = server.herdrCalls().length, saveTabsBefore = server.herdrTabs().length;
    const gate = partial ? await scriptFileGate(server.storageFile) : undefined;
    let savedDispatch: unknown;
    try {
      savedDispatch = await call('run', { action: 'dispatch', nodes: ['save_bot'] });
      if (gate) {
        await until(async () => gate.reached() ? true : undefined, 'actual pre-save file read', 5000);
        const executionId = text(at(savedDispatch, 'snapshot', 'nodes', 'save_bot', 'execution', 'id'));
        const collision = join(zone, '.manager-zone/.workflow', runId, executionId, 'handoff.json');
        mkdirSync(dirname(collision), { recursive: true }); writeFileSync(collision, 'OWNED COLLISION MUST SURVIVE');
        record.collision = collision;
      }
    } finally { await gate?.release(); }
    const savedReport = await report('save_bot');
    await until(async () => backend.herdrCalls().some(item => item.kind === 'agent_prompt' && typeof item.text === 'string' && item.text.includes(text(at(savedReport, 'id')))) ? true : undefined, 'saved report external notification');
    assert.equal(server.herdrTabs().length, saveTabsBefore, 'Rust saver creates no Tab');
    assert(server.herdrCalls().slice(saveCallsBefore).every(item => item.kind === 'agent_prompt'), 'Rust saver only notifies existing manager');
    assert.equal(at(savedReport, 'from'), null);
    assert.deepEqual(at(savedReport, 'source'), { kind: 'rust_script', rustScript: 'save_bot_guides' });
    assert.equal(at(savedReport, 'to', 'sessionId'), manager);
    const after = await http('/api/scheduler/bots/edit', { id: 'native-result' });
    const expected = { ...blank, when: 'abc', plan_guide: 'hello', node_guide: '' };
    assert.deepEqual(JSON.parse(text(at(after, 'revision', 'original'))), expected);
    assert.notDeepEqual(at(after, 'revision'), at(baseline, 'revision'));
    assert.deepEqual(at(await http(`/api/tasks/${tasks['literal-target']}`), 'task'), target);
    const saved = json(output(savedReport, 'saved'));
    assert.deepEqual(saved, { schema_version: 1, kind: 'saved', bot: expected, revision: at(after, 'revision'), target: at(baseline, 'target') });
    await nativeRead(output(savedReport, 'saved'), 'hello');
    await call('collect', {});
    if (!partial) {
      assert.equal(at(savedReport, 'canComplete'), true);
      assert.equal(at(json(output(savedReport, 'handoff')), 'stage'), 'saved');
      await nativeRead(output(savedReport, 'handoff'), 'saved');
      assert.equal(at(await fact(), 'run', 'nodes', 'save_bot', 'status'), 'running');
      await complete('save_bot'); await call('run', { action: 'finish' });
      assert.equal(at(await fact(), 'run', 'status'), 'completed');
    } else {
      assert.equal(at(savedReport, 'canComplete'), false);
      const failed = await fact();
      assert.equal(at(failed, 'run', 'nodes', 'save_bot', 'execution', 'lifecycle', 'failure', 'code'), 'material-write-failed');
      assert.equal(at(failed, 'run', 'nodes', 'save_bot', 'execution', 'lifecycle', 'failure', 'effects', 'write'), 'succeeded');
      assert.equal(at(failed, 'run', 'nodes', 'save_bot', 'execution', 'lifecycle', 'failure', 'effects', 'readBack'), 'succeeded');
      await call('run', { action: 'complete', nodeId: 'save_bot', reason: 'False report must refuse' }, true);
      const collision = text(record.collision); assert.equal(readFileSync(collision, 'utf8'), 'OWNED COLLISION MUST SURVIVE'); rmSync(collision);
      await call('run', { action: 'fail', nodeId: 'save_bot', reason: 'Read partial saved effect; explicitly fail before retry' });
      const oldExecution = at(savedReport, 'executionId');
      const retry = await call('run', { action: 'retry', nodeId: 'save_bot', confirmed: true, reason: 'Repair collision only; original baseline must still conflict; do not roll back saved Bot' });
      record.retry = retry;
      const current = await fact();
      const nextExecution = text(at(current, 'run', 'nodes', 'save_bot', 'execution', 'id')); assert.notEqual(nextExecution, oldExecution);
      const conflict = await report('save_bot', nextExecution);
      assert.equal(at(conflict, 'canComplete'), false); assert.deepEqual(at(conflict, 'outputs'), []);
      assert.equal(at(await fact(), 'run', 'nodes', 'save_bot', 'execution', 'lifecycle', 'failure', 'code'), 'revision-conflict');
      assert.deepEqual(await http('/api/scheduler/bots/edit', { id: 'native-result' }), after);
      assert.deepEqual(readFileSync(output(created, 'baseline')), baselineBytes);
      assert.deepEqual(json(output(savedReport, 'saved')), saved);
      assert.deepEqual(list(at(await fact(), 'reports')).find(item => at(item, 'id') === at(savedReport, 'id')), savedReport);
      await call('run', { action: 'complete', nodeId: 'save_bot', reason: 'Old outputs never complete new execution' }, true);
    }
    // Inspect every script execution through public readback, including retry history.
    const final = await fact();
    for (const node of ['create_blank', 'save_bot']) {
      const execution = object(at(final, 'run', 'nodes', node, 'execution'));
      assert.equal(execution.kind, 'rust_script');
      for (const forbidden of ['chat', 'taskId', 'agent', 'childRunId']) assert(!(forbidden in execution));
    }
    record.final = final; record.baseline = baseline; record.saved = saved;
    record.publicBot = after; record.target = target; record.map = map;
    record.passed = true;
  } catch (error) { record.error = error instanceof Error ? error.stack : String(error); }
  finally {
    if (server) {
      record.calls = server.herdrCalls(); record.tabs = server.herdrTabs(); record.diagnostics = server.diagnostics();
      try { cpSync(dirname(server.configPath), join(dir, 'backend-files'), { recursive: true, filter: file => !file.endsWith('.exe') }); }
      catch (error) { record.captureError = String(error); record.passed = false; }
    }
    try { await closeDock?.(); } catch (error) { evidence.cleanupErrors.push(`${name}/native: ${String(error)}`); }
    try { await server?.cleanup(); record.processesExited = true; } catch (error) { evidence.cleanupErrors.push(`${name}/backend: ${String(error)}`); }
    for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    save(join(dir, 'evidence.json'), record);
  }
}
for (const host of ['omp', 'pi'] as const) for (const partial of [false, true]) await scenario(host, partial);
evidence.passed = evidence.scenarios.every(item => item.passed === true && item.processesExited === true) && evidence.cleanupErrors.length === 0;
save(join(destination, 'evidence.json'), evidence);
console.log(JSON.stringify({ passed: evidence.passed, evidence: join(destination, 'evidence.json'), human: evidence.human }));
process.exitCode = evidence.passed ? 0 : 1;
