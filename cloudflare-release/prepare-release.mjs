import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ARCHIVE_SHA256 = '0a9f2fcdab27c097eaa8097c4a8ce968221f380aa6ec5d543b8d8dda43ff3dec';
const MANIFEST_SHA256 = 'a72b99eed9631fd00beee9132c41953de8ba7f8229393e9c0b1aaa5716ca2ba7';
const baseDir = dirname(fileURLToPath(import.meta.url));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const fail = (message) => { throw new Error(message); };
const flags = process.argv.slice(2);
if (flags.length > 1 || (flags.length === 1 && !['--verify-only', '--extract-only'].includes(flags[0]))) {
  fail('Usage: node prepare-release.mjs [--verify-only | --extract-only]');
}
const verifyOnly = flags[0] === '--verify-only';
const extractOnly = flags[0] === '--extract-only';

const manifestData = readFileSync(join(baseDir, 'source-manifest.json'));
if (sha256(manifestData) !== MANIFEST_SHA256) fail('Source manifest checksum mismatch.');
const manifest = JSON.parse(manifestData.toString('utf8'));
if (manifest.schema_version !== 1 || manifest.archive !== 'source.tar.gz' || manifest.archive_sha256 !== ARCHIVE_SHA256) {
  fail('Unexpected manifest format or archive.');
}
if (!Array.isArray(manifest.files) || manifest.files.length !== manifest.file_count) fail('Invalid file count.');

const safePath = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/') || value.includes(':')) {
    fail('Unsafe archive path.');
  }
  if (value.split('/').some((part) => !part || part === '.' || part === '..')) fail('Unsafe archive path.');
  return value;
};
const expected = new Map();
for (const file of manifest.files) {
  safePath(file.path);
  if (expected.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    fail('Invalid or duplicate manifest entry.');
  }
  expected.set(file.path, file);
}
if (manifest.files.reduce((sum, file) => sum + file.size, 0) !== manifest.total_source_bytes) fail('Invalid source byte count.');

const compressed = readFileSync(join(baseDir, 'source.tar.gz'));
if (sha256(compressed) !== ARCHIVE_SHA256) fail('Source archive checksum mismatch.');
const tar = gunzipSync(compressed, { maxOutputLength: 32 * 1024 * 1024 });
const fieldText = (block, start, length) => {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
};
const octal = (block, start, length) => {
  const value = fieldText(block, start, length).trim();
  if (!/^[0-7]+$/.test(value)) fail('Invalid USTAR numeric field.');
  const result = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(result)) fail('Invalid USTAR size.');
  return result;
};
const entries = [];
const seen = new Set();
let offset = 0;
let foundEnd = false;
while (offset + 512 <= tar.length) {
  const header = tar.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) {
    if (offset + 1024 > tar.length || !tar.subarray(offset).every((byte) => byte === 0)) fail('Invalid tar terminator.');
    foundEnd = true;
    break;
  }
  if (fieldText(header, 257, 6) !== 'ustar') fail('Only USTAR archives are accepted.');
  const checksum = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
  if (checksum !== octal(header, 148, 8)) fail('Invalid tar header checksum.');
  // This snapshot has regular files only. Reject symlinks, hard links, devices,
  // directories and extended headers rather than trusting an extraction tool.
  if (header[156] !== 48 || fieldText(header, 157, 100)) fail('Unsupported tar entry type.');
  const prefix = fieldText(header, 345, 155);
  const name = safePath((prefix ? `${prefix}/` : '') + fieldText(header, 0, 100));
  const record = expected.get(name);
  if (!record || seen.has(name)) fail(`Unexpected or duplicate archive member: ${name}`);
  const size = octal(header, 124, 12);
  if (size !== record.size || offset + 512 + size > tar.length) fail(`Invalid archive member size: ${name}`);
  const data = tar.subarray(offset + 512, offset + 512 + size);
  if (sha256(data) !== record.sha256) fail(`Source checksum mismatch: ${name}`);
  seen.add(name);
  entries.push({ name, data });
  offset += 512 + Math.ceil(size / 512) * 512;
}
if (!foundEnd || seen.size !== expected.size) fail('Incomplete source archive.');
console.log(`Verified ${seen.size} source files (${manifest.total_source_bytes} bytes), archive SHA256 ${ARCHIVE_SHA256}.`);

if (!verifyOnly) {
  const appDir = join(baseDir, 'app');
  if (existsSync(appDir)) fail('app/ already exists. Run the build from a clean checkout.');
  const stagingDir = mkdtempSync(join(baseDir, '.prepared-app-'));
  try {
    for (const { name, data } of entries) {
      const destination = resolve(stagingDir, name);
      if (!destination.startsWith(stagingDir + sep)) fail('Extraction path escaped its target.');
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, data, { flag: 'wx', mode: 0o644 });
    }
    renameSync(stagingDir, appDir);
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
  if (extractOnly) {
    console.log('Verified source extracted into app/. Dependency installation and build were skipped.');
  } else {
    const runNpm = (args) => execFileSync('npm', args, { cwd: appDir, stdio: 'inherit' });
    runNpm(['ci', '--no-audit', '--no-fund']);
    runNpm(['run', 'cloudflare:check']);
    runNpm(['run', 'cloudflare:build']);
    execFileSync(process.execPath, ['scripts/cloudflare-preflight.mjs'], { cwd: appDir, stdio: 'inherit' });
    console.log('Cloudflare release prepared. Deployment is a separate CI step.');
  }
}
