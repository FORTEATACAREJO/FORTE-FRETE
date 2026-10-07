const CENTRAL_ORIGIN='https://site-forte-atacarejo.onrender.com';
const codes={vendas:'VENDAS',financeiro:'FINANCEIRO',frete:'FRETE',fiscal:'FISCAL','venda-externa':'VENDA_EXTERNA','carga-direta':'CARGA_DIRETA',patio:'PATIO',site:'SITE'};
const titles={vendas:'Forte Vendas',financeiro:'Forte Financeiro',frete:'Forte Frete',fiscal:'Forte Fiscal','venda-externa':'Venda Externa','carga-direta':'Carga Direta',patio:'Operador de Pátio',site:'Administração do site'};
export const safeCount=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
export function applicationKey(key){const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,x=>x.charCodeAt(0));}
export function startNotifications({client,app,bridge=false,worker=app==='site'?'/central-sw.js':'/sw.js'}){
 if(!client||!codes[app])return {refresh:async()=>{},dispose(){}};
 let disposed=false,busy=false,epoch=0,uid=null,lastState={count:0,items:[]},registration=null,enabled=false,subscribedFor=null,panelRequested=false;
 const originalTitle=document.title;
 const ready=(async()=>{try{const saved=window.ForteNotifications?.restoreSession?.();if(saved){const data=JSON.parse(saved);if(data.project===client.supabaseUrl&&data.app===app)await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});}}catch{}})();
 const holder=document.createElement('div');holder.className='forte-notifications';
 const button=document.createElement('button');button.type='button';button.className='forte-notification-button';button.textContent='ATIVAR NOTIFICAÇÕES';
 const number=document.createElement('span');number.className='forte-notification-number';number.hidden=true;button.append(number);
 const panel=document.createElement('section');panel.className='forte-notification-panel';panel.hidden=true;
 holder.append(button,panel);
 const style=document.createElement('style');style.textContent='.forte-notifications{font:14px Arial;color:#172b45;max-width:100%}.forte-notification-button{position:relative;border:0;border-radius:10px;padding:11px 14px;background:#123963;color:#fff;font-weight:700;cursor:pointer;min-height:40px}.forte-notification-number{position:absolute;right:-6px;top:-8px;background:#dc2626;color:white;border:2px solid white;min-width:20px;height:20px;border-radius:20px;padding:0 4px;display:grid;place-items:center;font-size:12px}.forte-notifications [hidden]{display:none!important}.forte-notification-panel{position:fixed;inset:20px;z-index:5700;overflow:auto;background:#fff;border:2px solid #123963;border-radius:18px;padding:22px;box-shadow:0 20px 100px #0008;max-width:620px;margin:auto;max-height:70vh}.forte-notification-panel button{background:#1455a3;color:white;border:0;padding:12px;border-radius:10px;margin:8px 8px 8px 0;cursor:pointer}.forte-notification-panel p{line-height:1.5}.forte-notification-panel a{display:block;padding:14px;background:#edf3fc;border-radius:10px;margin:10px 0;color:#174f94}@media(max-width:500px){.forte-notification-panel{inset:8px;padding:16px}}';
 if(!bridge)document.head.append(style);
 function mount(){if(bridge||disposed)return;const host=document.querySelector('[data-forte-top-actions]')||document.querySelector('.forte-access-admin')||document.querySelector('header')||document.body;if(holder.parentNode!==host)host.append(holder);}
 const observer=!bridge?new MutationObserver(mount):null;observer?.observe(document.body,{childList:true,subtree:true});mount();holder.hidden=true;
 const api=async(action,body={})=>{const result=await client.functions.invoke('forte-notifications',{body:{action,...body}});if(result.error)throw result.error;return result.data;};
 async function getWorker(){if(!('serviceWorker' in navigator))throw Error('Notificações não disponíveis neste navegador.');if(!registration){registration=await navigator.serviceWorker.register(worker,{scope:'/'});await navigator.serviceWorker.ready;}return registration;}
 function nativeSession(session){if(bridge)return;try{window.ForteNotifications?.syncSession(session?JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token,project:client.supabaseUrl,key:client.supabaseKey,app}):'');}catch{}}
 function publish(state){lastState=state;const count=safeCount(state.count);number.textContent=count>99?'99+':String(count);number.hidden=count===0;button.setAttribute('aria-label',count+' notificações. Abrir avisos de '+titles[app]);document.title=count?'('+count+') '+originalTitle:originalTitle;
  if(!bridge){try{if(count)navigator.setAppBadge?.(count)?.catch(()=>{});else navigator.clearAppBadge?.()?.catch(()=>{});}catch{}try{window.ForteNotifications?.setCount(count);}catch{}}
  const message={type:'FORTE_NOTIFICATION_STATUS',app:codes[app],count,updatedAt:Date.now()};
  if(bridge&&window.parent!==window)window.parent.postMessage(message,CENTRAL_ORIGIN);
  try{if(window.opener)window.opener.postMessage(message,CENTRAL_ORIGIN);}catch{}
  try{localStorage.setItem('forte-notifications:'+codes[app],JSON.stringify({...message,user:uid}));}catch{}
  if(panelRequested&&!panel.hidden)renderPanel();
 }
 function renderPanel(message=''){
  panel.replaceChildren();const heading=document.createElement('h2');heading.textContent=titles[app]+' • Avisos';panel.append(heading);
  const close=document.createElement('button');close.textContent='FECHAR';close.onclick=()=>{panelRequested=false;panel.hidden=true;button.focus();};panel.append(close);
  const update=document.createElement('button');update.textContent='ATUALIZAR';update.onclick=()=>refresh();panel.append(update);
  if(message){const status=document.createElement('p');status.setAttribute('role','status');status.textContent=message;panel.append(status);}
  if(!lastState.items?.length){const empty=document.createElement('p');empty.textContent='Nenhuma pendência no momento.';panel.append(empty);}
  for(const item of lastState.items||[]){const entry=document.createElement('a');const target=new URL(item.url||'/',location.origin);entry.href=target.origin===location.origin?target.href:'/';entry.textContent=item.text;entry.onclick=event=>{if(['cadastros','recuperacoes'].includes(item.kind)){event.preventDefault();panel.hidden=true;document.querySelector('.fa-admin-button')?.click();}};panel.append(entry);}
  const activate=document.createElement('button');activate.textContent=enabled?'REATIVAR AVISOS NO CELULAR':'ATIVAR AVISOS NO CELULAR';activate.onclick=enable;panel.append(activate);
  if(lastState.items?.some(x=>x.kind==='avisos')){const seen=document.createElement('button');seen.textContent='MARCAR AVISOS DE ACESSO COMO LIDOS';seen.onclick=async()=>{try{await api('SEEN');await refresh();}catch{renderPanel('Não foi possível marcar. Tente novamente.');}};panel.append(seen);}
 }
 async function saveSubscription(){if(bridge||!uid||!('Notification' in window)||Notification.permission!=='granted'||!('PushManager' in window))return;const reg=await getWorker();let sub=await reg.pushManager.getSubscription();if(!sub)return;const key=uid+':'+sub.endpoint;if(subscribedFor===key)return;await api('SUBSCRIBE',{subscription:sub.toJSON()});subscribedFor=key;enabled=true;}
 async function enable(){panel.hidden=false;renderPanel('Ativando avisos…');try{
  const session=(await client.auth.getSession()).data.session;
  if(window.ForteNotifications?.enable){window.ForteNotifications.enable();enabled=true;nativeSession(session);await refresh();renderPanel('Permita as notificações na solicitação do Android.');return;}
  if(!('Notification' in window)||!('PushManager' in window))throw Error('Para receber avisos, instale o aplicativo pelo navegador. No iPhone, use Safari e Adicionar à Tela de Início.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Permita as notificações deste aplicativo nas configurações do celular ou navegador.');
  const state=await api('SNAPSHOT');const reg=await getWorker();let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(state.publicKey)});
  await api('SUBSCRIBE',{subscription:sub.toJSON()});subscribedFor=uid+':'+sub.endpoint;enabled=true;await refresh();renderPanel('Notificações ativadas neste dispositivo.');
 }catch(error){renderPanel(error.message||'Não foi possível ativar agora. Tente novamente.');}}
 button.onclick=()=>{panelRequested=true;panel.hidden=false;renderPanel();};
 async function refresh(){await ready;if(disposed||busy)return;busy=true;const generation=epoch;try{
  const {data:{session}}=await client.auth.getSession();if(disposed||generation!==epoch)return;
  const nextUid=session?.user?.id||null;
  if(uid!==nextUid){uid=nextUid;subscribedFor=null;publish({count:0,items:[]});}
  if(!session){holder.hidden=true;nativeSession(null);return;}
  const state=await api('SNAPSHOT');if(disposed||generation!==epoch)return;
  if(!state?.allowed){holder.hidden=true;publish({count:0,items:[]});nativeSession(null);return;}
  holder.hidden=bridge;publish(state);nativeSession(session);
  enabled=Boolean(window.ForteNotifications?.enabled?.())||('Notification' in window&&Notification.permission==='granted');
  button.firstChild.textContent=enabled?'AVISOS':'ATIVAR NOTIFICAÇÕES';
  if(!bridge)await saveSubscription().catch(()=>{});
 }catch{if(!panel.hidden)renderPanel('Não foi possível atualizar agora. Confira sua conexão.');}finally{busy=false;}}
 function authChanged(event){epoch++;if(event==='SIGNED_OUT'){uid=null;subscribedFor=null;enabled=false;holder.hidden=true;publish({count:0,items:[]});nativeSession(null);if(!bridge)registration?.pushManager.getSubscription().then(sub=>sub?.unsubscribe()).catch(()=>{});}setTimeout(refresh,0);}
 async function centralSubscribe(event){
  if(!bridge||event.origin!==CENTRAL_ORIGIN||event.source!==window.parent||event.data?.type!=='FORTE_CENTRAL_SUBSCRIBE')return;
  try{const state=await api('SNAPSHOT');if(!state.allowed)return;const subscription={...event.data.subscription,forte_central:true};await api('SUBSCRIBE',{subscription});window.parent.postMessage({type:'FORTE_CENTRAL_SUBSCRIBED',app:codes[app]},CENTRAL_ORIGIN);}catch{}
 }
 if(bridge)window.addEventListener('message',centralSubscribe);
 const subscription=client.auth.onAuthStateChange(authChanged).data.subscription;
 const resume=()=>{if(document.visibilityState==='visible')refresh();};document.addEventListener('visibilitychange',resume);window.addEventListener('online',refresh);
 const timer=setInterval(refresh,30000);refresh();
 return {ready,refresh,dispose(){disposed=true;epoch++;clearInterval(timer);subscription.unsubscribe();observer?.disconnect();document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',refresh);if(bridge)window.removeEventListener('message',centralSubscribe);holder.remove();style.remove();}};
}
