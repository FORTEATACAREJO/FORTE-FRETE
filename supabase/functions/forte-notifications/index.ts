import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";
const origins:Record<string,string>={"https://forte-vendas.onrender.com":"vendas","https://forte-vendas-app.onrender.com":"vendas","https://forte-financeiro.onrender.com":"financeiro","https://forte-venda-externa.onrender.com":"venda-externa","https://forte-carga-direta.onrender.com":"carga-direta","https://forte-operador-patio.onrender.com":"patio","https://site-forte-atacarejo.onrender.com":"site","https://forte-frete.onrender.com":"frete","https://forte-fiscal.onrender.com":"fiscal"};
const names:Record<string,string>={vendas:"Forte Vendas",financeiro:"Forte Financeiro","venda-externa":"Venda Externa","carga-direta":"Carga Direta",patio:"Operador de Pátio",site:"Administração do site",frete:"Forte Frete",fiscal:"Forte Fiscal"};
const project=Deno.env.get("SUPABASE_URL")||"",frete=project.includes("nkynfbo"),fiscal=project.includes("xmfpvvm");
const table=fiscal?"profiles":frete?"usuarios_app":"fc_perfis",idcol=fiscal?"id":"user_id";
const client=createClient(project,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
function allowedLegacy(p:any,app:string){const role=p.role||p.perfil,perms=p.permissoes||{};if(role==="MASTER"||role==="ULTRA_ADMIN")return true;if(app==="site")return role==="ADMINISTRADOR"||perms.site===true;if(["ADMINISTRADOR","ADMIN"].includes(role))return true;if(frete||fiscal)return true;if(perms[app]===true)return true;if(app==="financeiro")return role==="FINANCEIRO"||perms.FINANCEIRO===true;if(app==="patio")return role==="OPERADOR_PATIO"||perms.PATIO===true;if(app==="venda-externa")return role==="VENDEDOR_EXTERNO";if(app==="carga-direta")return false;return !["MOTORISTA","OPERADOR_PATIO","CONSULTA"].includes(role)}
export async function snapshot(uid:string,app:string){
 const profile=await client.from(table).select("*").eq(idcol,uid).maybeSingle();if(profile.error)throw Error("Não foi possível conferir o acesso.");const p=profile.data;
 const own=await client.from("access_requests").select("id,app,status,managed_account").eq("user_id",uid);if(own.error)throw Error("Não foi possível conferir as autorizações.");
 const request=own.data?.find((x:any)=>x.app===app),managed=own.data?.some((x:any)=>x.managed_account);
 const approved=p&&(p.active??p.ativo)&&(!p.status_aprovacao||p.status_aprovacao==="APROVADO")&&!p.must_change_password&&!p.trocar_senha&&(managed?request?.status==="APROVADO":request?request.status==="APROVADO":allowedLegacy(p,app));
 if(!approved)return {allowed:false,count:0,items:[],signature:"blocked"};
 const admin=["MASTER","ULTRA_ADMIN","ADMINISTRADOR","ADMIN"].includes(p.role||p.perfil),items:any[]=[];let count=0,revision:any[]=[];
 if(admin){
  const pending=await client.from("access_requests").select("id,user_id,created_at").eq("app",app).eq("status","PENDENTE");if(pending.error)throw Error("Não foi possível conferir cadastros.");let rows=pending.data||[];
  if(!fiscal&&!frete&&rows.length){const scoped=await client.from(table).select(idcol).eq("empresa_id",p.empresa_id).in(idcol,rows.map((x:any)=>x.user_id));if(scoped.error)throw Error("Não foi possível conferir a empresa.");const ids=new Set(scoped.data.map((x:any)=>x[idcol]));rows=rows.filter((x:any)=>ids.has(x.user_id))}
  if(rows.length){count+=rows.length;revision.push(...rows.map((x:any)=>x.id));items.push({kind:"cadastros",count:rows.length,text:rows.length+" cadastro(s) aguardando análise"})}
  const resets=await client.from("access_recovery_requests").select("id,user_id").eq("app",app).eq("status","PENDENTE");if(resets.error)throw Error("Não foi possível conferir recuperações.");let resetRows=resets.data||[];
  if(!fiscal&&!frete&&resetRows.length){const scoped=await client.from(table).select(idcol).eq("empresa_id",p.empresa_id).in(idcol,resetRows.map((x:any)=>x.user_id));if(scoped.error)throw Error("Não foi possível conferir a empresa.");const ids=new Set(scoped.data.map((x:any)=>x[idcol]));resetRows=resetRows.filter((x:any)=>ids.has(x.user_id))}
  if(resetRows.length){count+=resetRows.length;revision.push(...resetRows.map((x:any)=>x.id));items.push({kind:"recuperacoes",count:resetRows.length,text:resetRows.length+" recuperação(ões) aguardando análise"})}
 }
 if(frete){
  if(admin){const review=await client.from("motoristas").select("id",{count:"exact"}).eq("status_cadastro","em_analise");if(review.error)throw Error("Não foi possível conferir documentos.");if(review.count){count+=review.count;revision.push(...review.data.map((x:any)=>x.id));items.push({kind:"motoristas",count:review.count,text:review.count+" motorista(s) com documentos aguardando análise"})}}
  const driver=await client.from("motoristas").select("id,status_cadastro").eq("auth_user_id",uid).maybeSingle();if(driver.error)throw Error("Não foi possível conferir o motorista.");
  if(admin||driver.data?.status_cadastro==="aprovado"){
   const loads=await client.from("cargas").select("id,rota_id,peso_min_t,peso_max_t").eq("status","publicada").order("id");if(loads.error)throw Error("Não foi possível conferir cargas.");
   let eligible=loads.data||[];
   if(!admin){
    const vehicles=await client.from("veiculos_motorista").select("capacidade_efetiva_t,capacidade_t").eq("motorista_id",driver.data.id).eq("ativo",true);
    const routes=await client.from("motorista_rotas").select("rota_id").eq("motorista_id",driver.data.id);
    if(vehicles.error||routes.error)throw Error("Não foi possível conferir as cargas do motorista.");
    const selected=new Set((routes.data||[]).map((x:any)=>x.rota_id));
    eligible=eligible.filter((load:any)=>(!load.rota_id||selected.has(load.rota_id))&&(vehicles.data||[]).some((v:any)=>{const capacity=Number(v.capacidade_efetiva_t??v.capacidade_t??0);return capacity>=Number(load.peso_min_t??36)&&capacity<=Number(load.peso_max_t??52)}));
   }
   const amount=eligible.length;
   if(amount){count+=amount;revision.push(...eligible.map((x:any)=>x.id));items.push({kind:"cargas",count:amount,text:amount+" carga(s) disponível(is)",url:"/?forte_view=cargas"})}
  }
 }
 const seen=await client.from("forte_notice_reads").select("seen_at").eq("user_id",uid).eq("app",app).maybeSingle();if(seen.error)throw Error("Não foi possível conferir avisos lidos.");
 const notes=request?await client.from("access_notifications").select("id,event",{count:"exact"}).eq("request_id",request.id).eq("user_id",uid).eq("audience","USER").gt("created_at",seen.data?.seen_at||"1970-01-01").in("event",["APROVADO","RECUSADO"]):{count:0,data:[]};if(notes.error)throw Error("Não foi possível conferir avisos.");
 if(notes.count){if(!frete||admin){count+=notes.count;revision.push(...notes.data.map((x:any)=>x.id));}items.push({kind:"avisos",count:notes.count,text:notes.count+" atualização(ões) do seu acesso"})}
 revision.sort();return {allowed:true,count,items,signature:JSON.stringify([count,...revision])};
}
export function validSubscription(s:any){try{const u=new URL(s?.endpoint);return u.protocol==="https:"&&u.port===""&&!u.username&&!u.password&&["fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com"].some(h=>u.hostname===h)&&/^[A-Za-z0-9_-]{80,100}$/.test(s.keys?.p256dh||"")&&/^[A-Za-z0-9_-]{20,30}$/.test(s.keys?.auth||"")}catch{return false}}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"",app=origins[origin],valid=Boolean(app)&&(fiscal?app==="fiscal":frete?app==="frete":!["fiscal","frete"].includes(app));
 const headers={"Access-Control-Allow-Origin":valid?origin:"null","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store",Vary:"Origin"};const reply=(data:any,status=200)=>Response.json(data,{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:valid?204:403,headers});
 if(req.method!=="POST")return reply({error:"Método não permitido."},405);
 try{
  const body=await req.json(),config=await client.rpc("forte_push_config");if(config.error||!config.data)throw Error("Não foi possível carregar notificações.");
  if(body.action==="DELIVER"){
   if(req.headers.get("x-forte-worker")!==config.data.worker)return reply({error:"Não autorizado."},401);
   
   const subscriptions=await client.from("forte_push_subscriptions").select("*").order("updated_at").limit(100);if(subscriptions.error)throw Error("Fila indisponível.");let sent=0;
   for(const sub of subscriptions.data||[]){
    try{webpush.setVapidDetails("mailto:masterforteatacarejo@gmail.com",sub.subscription.forte_central?config.data.centralPublicKey:config.data.publicKey,sub.subscription.forte_central?config.data.centralPrivateKey:config.data.privateKey);const state=await snapshot(sub.user_id,sub.app);
     if(!state.allowed){if(sub.subscription.forte_central&&sub.last_signature)await webpush.sendNotification(sub.subscription,JSON.stringify({title:names[sub.app],body:"Acesso encerrado.",count:0,app:sub.app,central:true,url:"/sistemas.html",tag:"forte-"+sub.app}),{TTL:300,timeout:5000});await client.from("forte_push_subscriptions").delete().eq("id",sub.id);continue}
     if(state.signature===sub.last_signature){await client.from("forte_push_subscriptions").update({updated_at:new Date().toISOString()}).eq("id",sub.id);continue}
     if(state.count>0||sub.last_signature){await webpush.sendNotification(sub.subscription,JSON.stringify({title:names[sub.app],body:state.count?state.items.map(x=>x.text).join(" • "):"Pendências atualizadas. Não há novos itens disponíveis.",count:state.count,app:sub.app,central:sub.subscription.forte_central===true,url:state.items.find(x=>x.kind==="cargas")?.url||"/",tag:"forte-"+sub.app}),{TTL:300,timeout:5000});sent++}
     await client.from("forte_push_subscriptions").update({last_signature:state.signature,updated_at:new Date().toISOString()}).eq("id",sub.id);
    }catch(e:any){if([404,410].includes(e.statusCode))await client.from("forte_push_subscriptions").delete().eq("id",sub.id);}
   }
   return reply({sent});
  }
  if(!valid)return reply({error:"Origem não permitida."},403);
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const auth=await client.auth.getUser(token);if(auth.error||!auth.data.user)return reply({error:"Entre para receber seus avisos."},401);const uid=auth.data.user.id;
  const state=await snapshot(uid,app);if(!state.allowed)return reply({allowed:false,count:0,items:[]},403);
  if(body.action==="UNSUBSCRIBE"){
   if(typeof body.endpoint!=="string")return reply({error:"Dispositivo inválido."},400);
   const removed=await client.from("forte_push_subscriptions").delete().eq("user_id",uid).eq("app",app).eq("endpoint",body.endpoint);if(removed.error)throw Error("Não foi possível desativar avisos.");
  }else if(body.action==="SUBSCRIBE"){
   if(!validSubscription(body.subscription))return reply({error:"Dispositivo de notificações inválido."},400);
   const previous=await client.from("forte_push_subscriptions").select("user_id,subscription,last_signature").eq("endpoint",body.subscription.endpoint).eq("app",app).maybeSingle();if(previous.error)throw Error("Não foi possível ativar avisos.");
   const sameDevice=previous.data?.user_id===uid&&previous.data.subscription?.keys?.p256dh===body.subscription.keys.p256dh&&previous.data.subscription?.keys?.auth===body.subscription.keys.auth&&Boolean(previous.data.subscription?.forte_central)===Boolean(body.subscription.forte_central);
   const saved=await client.from("forte_push_subscriptions").upsert({user_id:uid,app,endpoint:body.subscription.endpoint,subscription:body.subscription,last_signature:sameDevice?previous.data.last_signature:"",updated_at:new Date().toISOString()},{onConflict:"endpoint,app"});if(saved.error)throw Error("Não foi possível ativar avisos.");
  }else if(body.action==="SEEN"){const saved=await client.from("forte_notice_reads").upsert({user_id:uid,app,seen_at:new Date().toISOString()});if(saved.error)throw Error("Não foi possível marcar os avisos.")}
  else if(body.action!=="SNAPSHOT")return reply({error:"Ação inválida."},400);
  return reply({...state,publicKey:config.data.publicKey});
 }catch{return reply({error:"Não foi possível atualizar os avisos. Tente novamente."},503)}
});
