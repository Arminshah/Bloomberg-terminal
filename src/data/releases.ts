// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import pkg from '../../package.json';

/** The version of this build, from package.json. */
export const APP_VERSION: string = pkg.version;

export interface ReleaseNote {
  version: string;
  /** The release notes as written in docs/release-v<version>.md (Markdown). */
  text: string;
}

/** Numeric order of "2.10.0" against "2.9.1": negative when a comes first. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The release notes packed into the app when it is built (no network needed), newest first: 2.15.0 and later. The
 * notes before 2.15.0 named another product and stay out of the app; they are in the repository's docs folder.
 */
const files = import.meta.glob<string>(['../../docs/release-v*.md', '!../../docs/release-v2.{2,3,4,5,6,7,8,9,10,11,12,13,14}.*.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const RELEASES: ReleaseNote[] = Object.entries(files)
  .map(([path, text]) => ({ version: /release-v(\d+\.\d+\.\d+)\.md$/.exec(path)?.[1] ?? '', text }))
  .filter((r) => r.version)
  .sort((a, b) => compareVersions(b.version, a.version));

/** The notes of a version, or of this build's version. */
export function releaseNote(version = APP_VERSION): ReleaseNote | undefined {
  return RELEASES.find((r) => r.version === version);
}

/** The first line after the title: the release's one-paragraph summary. */
export function releaseSummary(r: ReleaseNote): string {
  return r.text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? '';
}
