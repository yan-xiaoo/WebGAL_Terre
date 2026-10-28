const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function linkMap(root) {
  const links = new Map();
  async function visit(relative) {
    const absolute = path.join(root, relative);
    const entry = await fs.lstat(absolute);
    if (entry.isSymbolicLink()) {
      const target = await fs.readlink(absolute);
      assert(!path.isAbsolute(target), `Absolute link: ${absolute} -> ${target}`);
      const resolved = await fs.realpath(absolute);
      assert(resolved.startsWith(path.resolve(root) + path.sep), `Link leaves bundle: ${absolute}`);
      links.set(relative, target);
    } else if (entry.isDirectory()) {
      for (const child of (await fs.readdir(absolute)).sort()) {
        await visit(path.join(relative, child));
      }
    }
  }
  await visit('');
  return links;
}

async function main() {
  const original = path.resolve('packages/WebGAL-electron/build', process.env.BUNDLE, 'WebGAL.app');
  const template = path.resolve('release/WebGAL/assets/templates/WebGAL_Electron_Template');
  const extracted = path.join(process.env.RUNNER_TEMP, 'extracted/WebGAL/assets/templates/WebGAL_Electron_Template');
  const expected = await linkMap(original);
  const executable = 'Contents/Frameworks/Electron Framework.framework/Electron Framework';
  const current = 'Contents/Frameworks/Electron Framework.framework/Versions/Current';
  assert(expected.has(executable), 'Original Framework binary must be a symbolic link');
  assert(expected.has(current), 'Original Framework must have Versions/Current link');
  assert.deepEqual(await linkMap(template), expected, 'Release template must retain all links');
  assert.deepEqual(await linkMap(extracted), expected, 'ZIP round trip must retain all links');
  const exportDir = path.join(process.env.RUNNER_TEMP, 'export/WebGAL.app');
  const movedDir = path.join(process.env.RUNNER_TEMP, 'portable/WebGAL.app');
  await fs.cp(extracted, exportDir, { recursive: true, verbatimSymlinks: true });
  await fs.mkdir(path.dirname(movedDir), { recursive: true });
  await fs.rename(exportDir, movedDir);
  await fs.rm(path.join(process.env.RUNNER_TEMP, 'extracted'), { recursive: true });
  assert.deepEqual(await linkMap(movedDir), expected, 'Moved export must be self-contained');
  assert((await fs.stat(path.join(movedDir, executable))).size > 0);
  console.log(`Verified ${expected.size} relative links through template copy, ZIP round trip and moved game export.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
