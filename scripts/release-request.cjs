// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
'use strict';

/** An explicit version-matched request lets the approved branch publish through the ordinary gated workflow. */
function releaseRequest(request, version, ref) {
  if (!request || request.schema !== 1 || !/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Invalid release request schema or package version.');
  if (request.tag !== `v${version}` || !/^v\d+\.\d+\.\d+$/.test(request.tag)) throw new Error('Release request and package version differ.');
  if (typeof request.branch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(request.branch) || request.branch.includes('..') || ref !== `refs/heads/${request.branch}`) throw new Error('Release request does not match the pushed branch.');
  return request.tag;
}

if (require.main === module) {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const request = JSON.parse(fs.readFileSync(path.join(root, '.github/release-request.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  process.stdout.write(`${releaseRequest(request, pkg.version, process.env.GITHUB_REF)}\n`);
}

module.exports = { releaseRequest };
