// The congress fixtures as bytes, for tests: the House Clerk's documents as published (PDF, ZIP).
const fs = require('node:fs');
const path = require('node:path');

module.exports = { fixture: (name) => fs.readFileSync(path.join(__dirname, name)) };
