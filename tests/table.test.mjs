import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoom, mutateRoom, visibleRoom, parseDice, rollDice } from '../lib/table-engine.mjs';
import { tableRequest, mcpRequest } from '../lib/table-service.mjs';
import { openStore } from '../local/store.mjs';

const host = { id: 'host', name: 'Host' }, guest = { id: 'guest', name: 'Guest' };
function setup() {
  let room = createRoom(host, 'Test table');
  const cmd = (op, payload = {}, user = host, die) => {
    const input = { op, payload, requestId: crypto.randomUUID(), expectedVersion: room.version };
    const mutation = mutateRoom(room, user, input, die);
    room = mutation.room;
    return { input, ...mutation };
  };
  return { cmd, get room() { return room; } };
}
function prepared(costFP = 2) {
  const s = setup();
  s.cmd('character', { name: 'Scout' });
  const r = s.cmd('rule', { name: 'Sample rule', kind: 'house_rule', source: 'Explicit test rule', formula: '3d6', comparator: 'lte', target: 10, costFP, successHpDelta: -3, failureHpDelta: -1, activate: true });
  const a = s.cmd('message', { kind: 'action', text: 'Test action' });
  s.cmd('plan', { actionId: a.result.actionId, ruleId: r.result.ruleId, scope: 'Test scope', risk: 'Test risk', targetId: s.room.characters[0].id });
  return { s, actionId: a.result.actionId };
}
test('dice grammar is bounded and rolls preserve individual dice', () => {
  for (const formula of ['0d6', '31d6', '1d1', '1d1001', '1d6+1001', '1d6;process.exit()', 'Infinity']) assert.throws(() => parseDice(formula));
  assert.deepEqual(rollDice(' 3d6 + 2 ', () => 3), { formula: '3d6+2', dice: [3,3,3], modifier: 2, total: 11 });
  assert.throws(() => rollDice('1d6', () => 7));
});
test('duplicate resolution is exactly once and reused action cannot reroll', () => {
  const { s, actionId } = prepared(); let rolls = 0;
  const resolved = s.cmd('resolve', { actionId }, host, () => { rolls++; return 2; });
  assert.equal(rolls, 3); assert.equal(s.room.characters[0].fp, 8); assert.equal(s.room.characters[0].hp, 7);
  const retried = mutateRoom(s.room, host, resolved.input, () => { throw Error('Must not roll again'); });
  assert.equal(retried.duplicate, true); assert.equal(retried.room.version, s.room.version);
  assert.deepEqual(retried.result, resolved.result);
  assert.throws(() => s.cmd('resolve', { actionId }), e => e.status === 409);
  assert.throws(() => mutateRoom(s.room, host, { ...resolved.input, payload: { actionId: 'other' } }), e => e.status === 409);
});
test('failed validation leaves resources, actions and version untouched', () => {
  const { s, actionId } = prepared(11); const before = structuredClone(s.room);
  assert.throws(() => s.cmd('resolve', { actionId }, host, () => { throw Error('Must validate FP first'); }));
  assert.deepEqual(s.room, before);
  assert.throws(() => mutateRoom(s.room, host, { op: 'roll', payload: { formula: '1d6' }, expectedVersion: 0, requestId: crypto.randomUUID() }), e => e.status === 409);
  assert.throws(() => mutateRoom(s.room, host, { op: 'roll', payload: { formula: '1d6' }, expectedVersion: s.room.version, requestId: '__proto__' }));
});
test('guest visibility excludes secrets, private documents and other whispers', () => {
  const s = setup(); s.cmd('join', { code: s.room.joinCode }, guest);
  s.cmd('secrets', { text: 'HIDDEN_NOTE' });
  s.cmd('document', { title: 'Secret', content: 'HIDDEN_DOC', visibility: 'gm' });
  s.cmd('document', { title: 'Rules', content: 'PUBLIC_DOC', visibility: 'public' });
  s.cmd('whisper', { recipient: host.id, text: 'HIDDEN_WHISPER' });
  s.cmd('whisper', { recipient: guest.id, text: 'VISIBLE_WHISPER' });
  const view = visibleRoom(s.room, guest), encoded = JSON.stringify(view);
  for (const key of ['secrets', 'joinCode', 'receipts', 'creationSignature']) assert.equal(Object.hasOwn(view,key), false);
  for (const marker of ['HIDDEN_NOTE', 'HIDDEN_DOC', 'HIDDEN_WHISPER']) assert.equal(encoded.includes(marker), false);
  assert.equal(encoded.includes('PUBLIC_DOC'), true); assert.equal(encoded.includes('VISIBLE_WHISPER'), true);
  assert.throws(() => visibleRoom(s.room, { id: 'stranger' }), e => e.status === 403);
  assert.throws(() => s.cmd('secrets', { text: 'overwrite' }, guest), e => e.status === 403);
  assert.throws(() => s.cmd('join', { code: s.room.joinCode }, { id: 'third', name: 'Third' }), e => e.status === 409);
});
test('source quotes must exist in public documents; drafts cannot drive a plan', () => {
  const s = setup(); s.cmd('character', { name: 'Scout' });
  const doc = s.cmd('document', { title: 'Rules', content: 'Roll 3d6 under 10.', visibility: 'public' });
  const rule = { name: 'Check', kind: 'source', documentId: doc.result.documentId, quote: 'Roll 3d6 under 10.', formula: '3d6', comparator: 'lte', target: 10 };
  assert.throws(() => s.cmd('rule', { ...rule, quote: 'Fabricated quote' }));
  const r = s.cmd('rule', rule), a = s.cmd('message', { kind: 'action', text: 'Check' });
  const plan = { actionId: a.result.actionId, ruleId: r.result.ruleId, scope: 'Scope', risk: 'Risk' };
  assert.throws(() => s.cmd('plan', plan));
  s.cmd('approveRule', { ruleId: r.result.ruleId }); s.cmd('plan', plan);
  assert.equal(s.room.actions[0].plan.rule.status, 'active');
  assert.throws(() => s.cmd('plan', plan), e => e.status === 409);
});
test('SQLite survives reopening, rejects stale writes, and create retries use one room', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'night-table-test-')), path = join(directory, 'table.sqlite');
  let store = openStore(path);
  try {
    const create = { op: 'create', payload: { title: 'Persistent table' }, requestId: crypto.randomUUID() };
    const [first, retry] = await Promise.all([tableRequest(store, host, create), tableRequest(store, host, create)]);
    assert.equal(first.room.id, retry.room.id); assert.equal(store.list().length, 1);
    await assert.rejects(tableRequest(store, host, { ...create, payload: { title: 'Different' } }), e => e.status === 409);
    const stale = store.get(first.room.id);
    const changed = mutateRoom(stale, host, { op: 'settings', payload: { title: 'Saved title' }, requestId: crypto.randomUUID(), expectedVersion: 0 }).room;
    assert.equal(store.save(changed, 0), true); assert.equal(store.save(stale, 0), false);
    store.close(); store = openStore(path);
    assert.equal(store.get(first.room.id).title, 'Saved title'); assert.equal(store.get(first.room.id).version, 1);
  } finally { store.close(); rmSync(directory, { recursive: true }); }
});
test('GM bridge cannot activate rules or execute unlisted commands', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'night-table-test-')), store = openStore(join(directory,'table.sqlite'));
  try {
    const { room } = await tableRequest(store, host, { op: 'create', payload: {}, requestId: crypto.randomUUID() });
    const args = { op: 'rule', roomId: room.id, requestId: crypto.randomUUID(), expectedVersion: 0, payload: { activate: true } };
    await assert.rejects(tableRequest(store, host, args, 'agent'), e => e.status === 403);
    const result = await mcpRequest(store, host, { id: 1, method: 'tools/call', params: { name: 'run_table_command', arguments: { ...args, op: 'resource' } } });
    assert.equal(result.result.isError, true); assert.equal(store.get(room.id).version, 0);
    await assert.rejects(tableRequest(store, host, null), e => e.status === 400);
  } finally { store.close(); rmSync(directory, { recursive: true }); }
});
