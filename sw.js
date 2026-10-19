importScripts('/forte-notification-worker.js?v=20261005-1');
const CACHE="forte-frete-mobile-20261019-tabela-frete-sugestao-17";
const CORE=['/legal-acceptance.js','/termo-unificado.html','/forte-ui.css','/mobile-approved.css','/mobile-dashboard.js','/','/index.html','/access-standard.js','/registration-dossier.js','/driver-onboarding.js','/profiles.js','/app.js','/frete-driver.js','/frete-loads-admin.js','/registration.js','/export-cadastros.js','/manifest.webmanifest','/favicon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!CORE.includes(url.pathname))return;event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response}).catch(()=>caches.match(event.request)))});

