const { test } = require("node:test");
const assert = require("node:assert/strict");
const { replaceMachOUuids } = require("./after-pack.cjs");

function executable(cpu = 0x100000c) {
  const data = Buffer.alloc(80, 0);
  data.writeUInt32LE(0xfeedfacf, 0);
  data.writeUInt32LE(cpu, 4);
  data.writeUInt32LE(1, 16);
  data.writeUInt32LE(24, 20);
  data.writeUInt32LE(0x1b, 32);
  data.writeUInt32LE(24, 36);
  data.fill(0xaa, 40, 56);
  data.fill(0xbb, 56);
  return data;
}

test("packaged executables get distinct UUIDs without changing other bytes", () => {
  for (const cpu of [0x100000c, 0x1000007]) {
    const original = executable(cpu);
    const first = replaceMachOUuids(original);
    const second = replaceMachOUuids(original);
    assert.notDeepEqual(first.subarray(40, 56), original.subarray(40, 56));
    assert.notDeepEqual(first.subarray(40, 56), second.subarray(40, 56));
    assert.deepEqual(first.subarray(0, 40), original.subarray(0, 40));
    assert.deepEqual(first.subarray(56), original.subarray(56));
    assert.deepEqual(original, executable(cpu));
  }
});

test("both universal binary slices receive distinct UUIDs", () => {
  for (const wide of [false, true]) {
    const data = Buffer.alloc(256);
    data.writeUInt32BE(wide ? 0xcafebabf : 0xcafebabe, 0);
    data.writeUInt32BE(2, 4);
    for (const [i, start] of [80, 160].entries()) {
      const entry = 8 + i * (wide ? 32 : 20);
      if (wide) {
        data.writeBigUInt64BE(BigInt(start), entry + 8);
        data.writeBigUInt64BE(80n, entry + 16);
      } else {
        data.writeUInt32BE(start, entry + 8);
        data.writeUInt32BE(80, entry + 12);
      }
      executable().copy(data, start);
    }
    const patched = replaceMachOUuids(data);
    assert.notDeepEqual(patched.subarray(120, 136), data.subarray(120, 136));
    assert.notDeepEqual(patched.subarray(200, 216), data.subarray(200, 216));
    assert.notDeepEqual(patched.subarray(120, 136), patched.subarray(200, 216));
    data.copy(patched, 120, 120, 136);
    data.copy(patched, 200, 200, 216);
    assert.deepEqual(patched, data);
  }
});

test("missing UUIDs and malformed binaries fail packaging", () => {
  assert.throws(() => replaceMachOUuids(Buffer.alloc(4)));
  const missing = executable();
  missing.writeUInt32LE(0x19, 32);
  assert.throws(() => replaceMachOUuids(missing), /exactly one LC_UUID/);
  const truncated = executable();
  truncated.writeUInt32LE(1000, 36);
  assert.throws(() => replaceMachOUuids(truncated), /command size/);
  assert.throws(() => replaceMachOUuids(executable().subarray(0, 48)));
});
