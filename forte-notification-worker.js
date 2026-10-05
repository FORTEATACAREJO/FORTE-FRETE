const FORTE_ORIGINS={vendas:'https://forte-vendas.onrender.com',financeiro:'https://forte-financeiro.onrender.com',frete:'https://forte-frete.onrender.com',fiscal:'https://forte-fiscal.onrender.com','venda-externa':'https://forte-venda-externa.onrender.com','carga-direta':'https://forte-carga-direta.onrender.com',patio:'https://forte-operador-patio.onrender.com',site:'https://site-forte-atacarejo.onrender.com'};
const CENTRAL='https://site-forte-atacarejo.onrender.com';
const badgeCount=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
let queue=Promise.resolve();
async function badge(count){try{if(count&&self.navigator.setAppBadge)await self.navigator.setAppBadge(count);else if(self.navigator.clearAppBadge)await self.navigator.clearAppBadge();}catch{}}
async function centralCount(app,count){
 const cache=await caches.open('forte-notification-counts-v1'),key=new URL('/__forte_notification_counts',self.location.origin).href;
 let state={};try{const previous=await cache.match(key);if(previous)state=await previous.json();}catch{}
 state[app]={count,updatedAt:Date.now()};await cache.put(key,new Response(JSON.stringify(state),{headers:{'Content-Type':'application/json'}}));
 const total=Object.values(state).reduce((sum,item)=>sum+(Date.now()-item.updatedAt<24*60*60*1000?badgeCount(item.count):0),0);await badge(total);
 const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const page of pages)page.postMessage({type:'FORTE_CENTRAL_PUSH',app,count});return total;
}
self.addEventListener('message',event=>{
 const data=event.data;if(self.location.origin!==CENTRAL||data?.type!=='FORTE_CENTRAL_COUNT'||!FORTE_ORIGINS[data.app])return;
 if(!event.source?.url||new URL(event.source.url).origin!==CENTRAL)return;
 queue=queue.catch(()=>{}).then(()=>centralCount(data.app,badgeCount(data.count)));event.waitUntil(queue);
});
self.addEventListener('push',event=>{
 queue=queue.catch(()=>{}).then(async()=>{
  let data;try{data=event.data?.json();}catch{return;}if(!data)return;
  const count=badgeCount(data.count),central=data.central===true&&self.location.origin===CENTRAL&&Boolean(FORTE_ORIGINS[data.app]);
  const total=central?await centralCount(data.app,count):count;if(!central)await badge(count);
  const url=new URL(data.url||'/',central?FORTE_ORIGINS[data.app]:self.location.origin);
  const allowed=central?url.origin===FORTE_ORIGINS[data.app]:url.origin===self.location.origin;
  const safeUrl=allowed?url.href:new URL('/',self.location.origin).href;
  const tag=data.tag||'forte-notifications';const existing=await self.registration.getNotifications({tag});existing.forEach(note=>note.close());
  
  await self.registration.showNotification(data.title||'Forte Atacarejo',{body:data.body||count+' itens para verificar',tag,renotify:true,data:{url:safeUrl,count,central,app:data.app}});
  await badge(total);
 });event.waitUntil(queue);
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const data=event.notification.data||{},target=new URL(data.url||'/',self.location.origin);
 const allowed=target.origin===self.location.origin||(self.location.origin===CENTRAL&&data.central===true&&target.origin===FORTE_ORIGINS[data.app]);if(!allowed)return;
 const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=pages.find(page=>new URL(page.url).origin===target.origin);
 if(existing){await existing.navigate(target.href);await existing.focus();}else await self.clients.openWindow(target.href);
})());});
