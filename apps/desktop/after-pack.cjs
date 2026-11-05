const { randomUUID } = require("node:crypto");
const { readFile, readdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

// Electron ships the same LC_UUID to every app using a given binary. macOS
// uses it for Local Network privacy, so changing the bundle ID is not enough.
// Run before signing, on packaged copies only, including every helper app.
function replaceMachOUuids(input) {
  const data = Buffer.from(input);
  const slots = [];
  function slice(start, size) {
    if (start < 0 || size < 32 || start + size > data.length)
      throw new Error("Invalid Mach-O slice bounds.");
    if (data.readUInt32LE(start) !== 0xfeedfacf)
      throw new Error("Expected a little-endian 64-bit Mach-O executable.");
    const count = data.readUInt32LE(start + 16);
    const end = start + 32 + data.readUInt32LE(start + 20);
    if (end > start + size) throw new Error("Invalid Mach-O load commands.");
    let offset = start + 32;
    let uuidCount = 0;
    for (let i = 0; i < count; i++) {
      if (offset + 8 > end) throw new Error("Truncated Mach-O load command.");
      const command = data.readUInt32LE(offset);
      const length = data.readUInt32LE(offset + 4);
      if (length < 8 || offset + length > end)
        throw new Error("Invalid Mach-O load command size.");
      if (command === 0x1b) {
        if (length !== 24) throw new Error("Invalid LC_UUID command.");
        slots.push(offset + 8);
        uuidCount++;
      }
      offset += length;
    }
    if (offset !== end || uuidCount !== 1)
      throw new Error("Expected exactly one LC_UUID per Mach-O slice.");
  }
  if (data.length < 8) throw new Error("Truncated Mach-O header.");
  const magic = data.readUInt32BE(0);
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const count = data.readUInt32BE(4);
    const wide = magic === 0xcafebabf;
    const stride = wide ? 32 : 20;
    const headerEnd = 8 + count * stride;
    if (!count || headerEnd > data.length)
      throw new Error("Invalid universal Mach-O header.");
    let previousEnd = headerEnd;
    const slices = [];
    for (let i = 0; i < count; i++) {
      const offset = 8 + i * stride;
      const start = wide
        ? Number(data.readBigUInt64BE(offset + 8))
        : data.readUInt32BE(offset + 8);
      const size = wide
        ? Number(data.readBigUInt64BE(offset + 16))
        : data.readUInt32BE(offset + 12);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size))
        throw new Error("Invalid universal Mach-O slice bounds.");
      slices.push({ start, size });
    }
    for (const { start, size } of slices.sort((a, b) => a.start - b.start)) {
      if (start < previousEnd) throw new Error("Overlapping Mach-O slices.");
      slice(start, size);
      previousEnd = start + size;
    }
  } else {
    slice(0, data.length);
  }
  for (const offset of slots)
    Buffer.from(randomUUID().replaceAll("-", ""), "hex").copy(data, offset);
  return data;
}

async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const bundle = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  async function patchBundle(app) {
    const executables = join(app, "Contents", "MacOS");
    for (const entry of await readdir(executables, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = join(executables, entry.name);
      await writeFile(path, replaceMachOUuids(await readFile(path)));
      console.log(`Assigned unique Mach-O UUIDs: ${path}`);
    }
  }
  await patchBundle(bundle);
  const frameworks = join(bundle, "Contents", "Frameworks");
  for (const entry of await readdir(frameworks, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith(".app"))
      await patchBundle(join(frameworks, entry.name));
  }
}

module.exports = afterPack;
module.exports.replaceMachOUuids = replaceMachOUuids;
