const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../../lib/client/system/modules/eventemitter2.js'), 'utf8');

test('removes wildcard listeners both from an array and as the last listener', function () {
  const sandbox = { exports: {} };
  vm.runInNewContext(source, sandbox);
  const emitter = new sandbox.exports.EventEmitter2({ wildcard: true });
  let remainingCalls = 0;
  const removed = function () { assert.fail('removed listener ran'); };
  const remaining = function () { remainingCalls++; };
  emitter.on('node.*', removed);
  emitter.on('node.*', remaining);
  emitter.off('node.*', removed);
  emitter.emit('node.change');
  assert.equal(remainingCalls, 1);
  emitter.off('node.*', remaining);
  assert.equal(emitter.listeners('node.*').length, 0);

  emitter.on('owner.*', removed);
  emitter.off('owner.*', removed);
  assert.equal(emitter.listeners('owner.*').length, 0);
});

test('dispatches onAny without changing the global loop index', function () {
  const sandbox = { exports: {}, i: 'unchanged' };
  vm.runInNewContext(source, sandbox);
  const emitter = new sandbox.exports.EventEmitter2();
  let anyPayload;
  let namedPayload;
  emitter.onAny(function (payload) { anyPayload = payload; });
  emitter.on('change', function (payload) { namedPayload = payload; });
  emitter.emit('change', 'updated');
  assert.equal(anyPayload, 'updated');
  assert.equal(namedPayload, 'updated');
  assert.equal(sandbox.i, 'unchanged');
});
