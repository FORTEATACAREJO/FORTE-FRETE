const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const files = ['forte-ui.css', 'atendimento.js', 'privacy-center.js', 'privacidade.html', 'suporte.html', 'excluir-conta.html', 'icon-192.png', 'icon-512.png', 'index.html', 'access-standard.js', 'driver-onboarding.js', 'user-invites.js', 'integration-vault.js', 'forte-notifications.js', 'forte-notification-worker.js', 'notification-bridge.js', 'notification-bridge.html', 'profiles.js', 'app.js', 'frete-driver.js', 'frete-loads-admin.js', 'gmail-central.js', 'registration.js', 'export-cadastros.js', 'favicon.svg', 'manifest.webmanifest', 'sw.js'];
const dist = path.resolve('dist');
fs.mkdirSync(dist, { recursive: true });
for (const file of files) {
  if (file.endsWith('.js')) {
    const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(file, 'utf8'), encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`Sintaxe inválida em ${file}: ${check.stderr}`);
  }
  fs.copyFileSync(file, path.join(dist, file));
}
fs.copyFileSync(path.join('public', 'forte-share-install.js'), path.join(dist, 'forte-share-install.js'));
fs.writeFileSync(path.join(dist, 'config.js'), `export const SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_URL || '')};export const SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY || '')};`);

// Validate the published set, not stale files left by an earlier build.
const published = new Set([...files, 'config.js'].map(file => path.join(dist, file)));
for (const file of files.filter(file => file.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(dist, file), 'utf8');
  const imports = source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g);
  for (const [, specifier] of imports) {
    const dependency = path.resolve(dist, path.dirname(file), specifier);
    if (!published.has(dependency)) throw new Error(`Dependência ausente na publicação: ${file} importa ${specifier}`);
  }
}


