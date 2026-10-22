import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, open, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A numeric release version is required.');
// Windows only: the app is released for Windows.
const files = {
  windows: [`Armin-Terminal-Setup-${version}.exe`, `Armin-Terminal-${version}-Portable.exe`],
};
files.portable = [files.windows[1]];

if (process.argv[2] === 'checksums') {
  const names = files[process.argv[3]];
  if (!names) throw new Error('Choose windows or portable.');
  const manifest = {};
  for (const name of names) {
    const path = join('release', name);
    const info = await stat(path);
    if (!info.isFile() || info.size < 1_000_000) throw new Error(`Missing or incomplete package: ${name}`);
    const file = await open(path, 'r');
    const header = Buffer.alloc(8);
    try { await file.read(header, 0, header.length, 0); } finally { await file.close(); }
    const valid = name.endsWith('.exe') && header.subarray(0, 2).toString() === 'MZ';
    if (!valid) throw new Error(`Unexpected package format: ${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    manifest[name] = hash.digest('hex');
    await writeFile(`${path}.sha256`, `${manifest[name]}  ${name}\n`);
    console.log(`Checked ${name} (${info.size} bytes)`);
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `manifest=${JSON.stringify(manifest)}\n`);
} else if (process.argv[2] === 'validate') {
  const tag = process.env.RELEASE_TAG;
  const repository = process.env.GH_REPO;
  if (tag !== `v${version}` || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Version/tag/repository mismatch.');
  // The REST tag endpoint returns published releases only. gh release view also
  // finds drafts; use its numeric API URL to retain the server's asset digests.
  const metadata = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--repo', repository, '--json', 'apiUrl'], { encoding: 'utf8' }));
  const prefix = `https://api.github.com/repos/${repository}/releases/`;
  if (!metadata.apiUrl?.startsWith(prefix) || !/^\d+$/.test(metadata.apiUrl.slice(prefix.length))) throw new Error('Unexpected release API location.');
  const release = JSON.parse(execFileSync('gh', ['api', metadata.apiUrl], { encoding: 'utf8' }));
  if (!release.draft) throw new Error('Only a draft release may be published by this workflow.');
  const manifest = JSON.parse(process.env.WINDOWS_MANIFEST ?? '{}');
  for (const name of files.windows) {
    const digest = manifest[name];
    if (!/^[a-f0-9]{64}$/.test(digest ?? '')) throw new Error(`Missing build digest for ${name}`);
    const asset = release.assets.find((a) => a.name === name);
    const checksum = release.assets.find((a) => a.name === `${name}.sha256`);
    if (!asset || asset.state !== 'uploaded' || asset.size < 1_000_000 || !checksum || checksum.state !== 'uploaded' || checksum.size < 64) throw new Error(`Missing or incomplete uploaded package/checksum: ${name}`);
    if (asset.digest && asset.digest !== `sha256:${digest}`) throw new Error(`Uploaded digest mismatch: ${name}`);
  }
  console.log(`Verified two packages and two checksums for ${tag}.`);
} else {
  throw new Error('Use checksums <platform> or validate.');
}
