import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ARCHIVE_SHA256 = 'bfa5594eb7f2412df5f7eb11d348f784ec0687dacd8bb9c9078a730dfedd621e';
const MANIFEST_SHA256 = '9d3bae4eda0174c9fe0006d53ae557e96ab2e8a76ec18cf71698e7274057e5e1';
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
    for (const entry of entries) {
      const { name } = entry;
      let { data } = entry;
      // Remove the transient Facebook availability badge from the verified snapshot.
      // Provider checks and the disabled state remain unchanged.
      if (name === 'frontend/src/features/auth/Login.tsx') {
        const source = data.toString('utf8');
        const badge = '                  {!providers.facebook && <span className="auth-pill-soon">Soon</span>}\n';
        if (source.split(badge).length !== 2) fail('Expected exactly one Facebook availability badge.');
        let updated = source.replace(badge, '');
        // Remove only the login chooser's LINE entry and its unused config request.
        // Existing LINE account linking and notifications stay available in the app.
        const lineFragments = [
          "  const [liffId, setLiffId] = useState<string | null>(null);\n",
          "    fetch('/api/liff-config', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).then(body => {\n      if (!cancelled && typeof body?.liffId === 'string' && /^[A-Za-z0-9-]+$/.test(body.liffId)) setLiffId(body.liffId);\n    }).catch(() => { /* LINE entry stays hidden */ });\n",
          "                {liffId && (\n                  <a href={`https://liff.line.me/${liffId}?openPath=%2Fapp`} className=\"auth-pill\" data-testid=\"auth-line\">\n                    <svg className=\"h-5 w-5\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"currentColor\"><path d=\"M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314\"/></svg>\n                    Continue with LINE\n                  </a>\n                )}\n"
];
        for (const fragment of lineFragments) {
          if (updated.split(fragment).length !== 2) fail('Expected exactly one LINE login fragment.');
          updated = updated.replace(fragment, '');
        }
        data = Buffer.from(updated, 'utf8');
      }
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
