const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'frete-build-'));
try {
  for (const file of fs.readdirSync(root)) {
    if (fs.statSync(path.join(root, file)).isFile()) fs.copyFileSync(path.join(root, file), path.join(fixture, file));
  }
  const build = () => spawnSync(process.execPath, ['build.js'], { cwd: fixture, encoding: 'utf8' });
  let result = build();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(fixture, 'dist/profiles.js'), 'utf8'), fs.readFileSync(path.join(root, 'profiles.js'), 'utf8'));
  // A file left in dist must not conceal an omitted publication dependency.
  fs.writeFileSync(path.join(fixture, 'dist/missing.js'), 'export default true;');
  fs.appendFileSync(path.join(fixture, 'app.js'), '\nimport "./missing.js";\n');
  result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Dependência ausente na publicação: app.js importa .\/missing.js/);
  console.log('PASS: profiles.js publicado; dependência omitida bloqueia build mesmo com arquivo antigo em dist.');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
