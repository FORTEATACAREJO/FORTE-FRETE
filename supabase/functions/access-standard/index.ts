import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const apps:Record<string,string>={"https://forte-vendas.onrender.com":"vendas","https://forte-vendas-app.onrender.com":"vendas","https://forte-financeiro.onrender.com":"financeiro","https://forte-venda-externa.onrender.com":"venda-externa","https://forte-carga-direta.onrender.com":"carga-direta","https://forte-operador-patio.onrender.com":"patio","https://site-forte-atacarejo.onrender.com":"site","https://forte-frete.onrender.com":"frete","https://forte-fiscal.onrender.com":"fiscal"};
const digits=(x:unknown)=>String(x||"").replace(/\D/g,"");
export function validCpf(v:string){if(!/^\d{11}$/.test(v)||/^(\d)\1{10}$/.test(v))return false;for(const n of[9,10]){let s=0;for(let i=0;i<n;i++)s+=Number(v[i])*(n+1-i);if((s*10%11)%10!==Number(v[n]))return false}return true}
export function validBirth(v:string){const d=new Date(v+"T00:00:00Z");return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v&&v<new Date().toISOString().slice(0,10)}
export function validateRegistration(b:any){const nome=String(b.nome||"").trim().replace(/\s+/g," "),cpf=digits(b.cpf),email=String(b.email||"").trim().toLowerCase(),birth=String(b.data_nascimento||"");let whatsapp=digits(b.whatsapp);if(/^\d{10,11}$/.test(whatsapp))whatsapp="55"+whatsapp;
if(nome.length<5||!nome.includes(" "))throw Error("Informe o nome completo.");
if(!validCpf(cpf))throw Error("CPF inválido.");
if(!/^55[1-9]\d[2-9]\d{7,8}$/.test(whatsapp))throw Error("Informe WhatsApp válido com DDD.");
if(!validBirth(birth))throw Error("Informe uma data de nascimento válida.");
if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error("E-mail inválido.");
if(typeof b.password!=="string"||!/^\d{6,}$/.test(b.password))throw Error("A senha deve ter somente números e no mínimo 6 dígitos.");
return {nome,cpf,whatsapp,email:email||null,data_nascimento:birth}}
export function legacyAllowed(p:any,app:string){const active=p.active??p.ativo,role=String(p.role||p.perfil||"").toUpperCase(),perms=p.permissoes||{};
if(!active||p.status_aprovacao&&p.status_aprovacao!=="APROVADO"||p.must_change_password||p.trocar_senha)return false;
if(["MASTER","ULTRA_ADMIN"].includes(role))return true;
if(app==="site")return role==="ADMINISTRADOR"||perms.site===true;
if(["ADMIN","ADMINISTRADOR"].includes(role))return true;
if(app==="fiscal"||app==="frete")return true;
if(perms[app]===true)return true;
if(app==="financeiro")return role==="FINANCEIRO"||perms.FINANCEIRO===true;
if(app==="patio")return ["OPERADOR_PATIO","CONFERENCIA"].includes(role)||perms.PATIO===true||perms["PÁTIO / ESTOQUE"]?.editar===true;
if(app==="venda-externa")return role==="VENDEDOR_EXTERNO";
if(app==="carga-direta")return false;
return !["CONSULTA","OPERADOR_PATIO","CONFERENCIA","MOTORISTA","MOTORISTA_ENTREGA"].includes(role)}
Deno.serve(async req=>{
const origin=req.headers.get("origin")||"",app=apps[origin],url=Deno.env.get("SUPABASE_URL")||"",fiscal=url.includes("xmfpvvmvdkepmnvtdoio"),frete=url.includes("nkynfboqwfxhhxcsrawl");
const validOrigin=Boolean(app)&&(fiscal?app==="fiscal":frete?app==="frete":!["fiscal","frete"].includes(app));
const headers={"Access-Control-Allow-Origin":validOrigin?origin:"null","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store",Vary:"Origin"};
const reply=(b:unknown,status=200)=>Response.json(b,{status,headers});
if(req.method==="OPTIONS")return new Response(null,{status:validOrigin?204:403,headers});
if(req.method!=="POST"||!validOrigin)return reply({error:"Requisição não permitida."},403);
let admin:any,createdId:string|null=null;
try{
const b=await req.json(),action=String(b.action||"STATUS"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const table=fiscal?"profiles":frete?"usuarios_app":"fc_perfis",idcol=fiscal?"id":"user_id";
const readProfile=async(uid:string)=>{const r=await admin.from(table).select("*").eq(idcol,uid).maybeSingle();if(r.error)throw Error("Falha ao conferir cadastro.");return r.data};
const rate=async(value:string,slots=1)=>{const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);for(let i=0;i<slots;i++){const a=new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode("standard:"+value+":"+Math.floor(Date.now()/60000)+":"+i)));const r=await admin.from("password_recovery_limits").insert({request_key:Array.from(a).map(x=>x.toString(16).padStart(2,"0")).join("")});if(!r.error)return true;if(r.error.code!=="23505")throw Error("Falha ao conferir tentativas.")}return false};
const audit=async(event:string,uid:string|null=null)=>{await admin.from("access_audit").insert({app,event,user_id:uid})};
const recoveryGeneric="Se os dados corresponderem ao cadastro, a solicitação será encaminhada ao admin ou master. Aguarde o contato no WhatsApp cadastrado.";
if(action==="RECOVERY_OPTIONS")return reply({email:true,admin:true,whatsapp:Boolean(Deno.env.get("WHATSAPP_ACCESS_TOKEN")&&Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")&&Deno.env.get("WHATSAPP_RECOVERY_TEMPLATE"))});
if(action==="RECOVERY_REQUEST"){
 const cpf=digits(b.cpf),birth=String(b.data_nascimento||"");let phone=digits(b.whatsapp);if(/^\d{10,11}$/.test(phone))phone="55"+phone;
 if(!validCpf(cpf)||!validBirth(birth)||!/^55[1-9]\d[2-9]\d{7,8}$/.test(phone))return reply({error:"Informe CPF, WhatsApp cadastrado com DDD e nascimento válidos."},400);
 if(!await rate("recovery-admin:"+cpf)||!await rate("recovery-admin-ip:"+(req.headers.get("x-forwarded-for")||"unknown").split(",")[0],8))return reply({error:"Aguarde um minuto antes de solicitar novamente."},429);
 const found=await admin.from(table).select("*").eq("cpf",cpf).limit(2);if(found.error)throw Error("Não foi possível conferir a solicitação.");
 const target=found.data?.length===1?found.data[0]:null;let registered=digits(target?.whatsapp);if(/^\d{10,11}$/.test(registered))registered="55"+registered;
 if(!target||registered!==phone||target.data_nascimento&&target.data_nascimento!==birth)return reply({message:recoveryGeneric});
 const saved=await admin.from("access_recovery_requests").insert({user_id:target[idcol],app,claimed_phone:phone,claimed_birth:birth});
 if(saved.error&&saved.error.code!=="23505")throw Error("Não foi possível registrar a solicitação.");
 if(!saved.error)await audit("RECUPERACAO_SOLICITADA",target[idcol]);return reply({message:recoveryGeneric});
}
if(action==="REGISTER"){
const v=validateRegistration(b);
if(v.email==="masterforteatacarejo@gmail.com"||v.email?.endsWith("@acesso.forte.internal"))return reply({error:"Use um e-mail pessoal válido."},400);
if(!await rate("register:"+v.cpf)||!await rate("register-ip:"+(req.headers.get("x-forwarded-for")||"unknown").split(",")[0],8))return reply({error:"Muitas tentativas. Aguarde um minuto."},429);
const existing=await admin.from(table).select(idcol).eq("cpf",v.cpf).limit(1);
if(existing.error)throw Error("Falha ao conferir cadastro.");
if(existing.data?.length)return reply({error:"CPF já cadastrado. Use Entrar ou Recuperar senha para solicitar outro aplicativo."},409);
const email=v.email||"cpf."+v.cpf+"@acesso.forte.internal";
const created=await admin.auth.admin.createUser({email,password:b.password,email_confirm:true,user_metadata:{full_name:v.nome,nome:v.nome}});
if(created.error||!created.data.user)return reply({error:"Não foi possível criar o cadastro. Confira se o CPF ou e-mail já está cadastrado."},409);
createdId=created.data.user.id;
const saved=await admin.rpc("access_register_profile",{p_user:createdId,p_app:app,p_nome:v.nome,p_cpf:v.cpf,p_whatsapp:v.whatsapp,p_birth:v.data_nascimento,p_email:v.email});
if(saved.error)throw Error("Falha ao salvar cadastro.");
await audit("CADASTRO_ENVIADO",createdId);createdId=null;
return reply({status:"PENDENTE",message:"Cadastro enviado para análise. Aguarde aprovação do admin ou master. Entre com CPF e senha para acompanhar."},201);
}
if(action==="LOGIN"){
const cpf=digits(b.cpf);if(!validCpf(cpf)||typeof b.password!=="string"||!b.password||b.password.length>256)return reply({error:"Informe CPF e sua senha cadastrada."},400);
if(!await rate("login:"+cpf,5))return reply({error:"Muitas tentativas. Aguarde um minuto."},429);
const p=await admin.from(table).select(idcol).eq("cpf",cpf).limit(2);
if(p.error||p.data?.length!==1){await audit("LOGIN_RECUSADO");return reply({error:"CPF ou senha inválidos."},401)}
const user=await admin.auth.admin.getUserById(p.data[0][idcol]);
const auth=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const logged=await auth.auth.signInWithPassword({email:user.data.user?.email||"",password:b.password});
if(logged.error||!logged.data.session){await audit("LOGIN_RECUSADO");return reply({error:"CPF ou senha inválidos."},401)}
if(!/^\d{6,}$/.test(b.password)){
const migrate=await admin.from(table).update(fiscal?{must_change_password:true}:{trocar_senha:true}).eq(idcol,logged.data.user.id);
if(migrate.error)throw Error("Não foi possível preparar a atualização da senha. Tente novamente.");
await audit("PADRONIZACAO_SENHA_EXIGIDA",logged.data.user.id);
}
await audit("LOGIN_CONFIRMADO",logged.data.user.id);
return reply({access_token:logged.data.session.access_token,refresh_token:logged.data.session.refresh_token});
}
const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,""),u=await admin.auth.getUser(token);
if(u.error||!u.data.user)return reply({error:"Sessão inválida. Entre novamente."},401);
const uid=u.data.user.id,p=await readProfile(uid);if(!p)return reply({error:"Cadastro não localizado."},403);
const isAdmin=Boolean((p.active??p.ativo)&&(!p.status_aprovacao||p.status_aprovacao==="APROVADO")&&!p.must_change_password&&!p.trocar_senha&&["MASTER","ADMIN","ADMINISTRADOR","ULTRA_ADMIN"].includes(p.role||p.perfil));
if(action==="RECOVERY_REVIEW"){
 if(!["ATENDIDO","RECUSADO"].includes(b.decision))return reply({error:"Informe uma decisão válida para a recuperação."},400);
 if(!isAdmin)return reply({error:"Somente admin ou master aprovado pode analisar."},403);
 if(b.decision==="ATENDIDO"&&b.verified_contact!==true)return reply({error:"Confirme a identidade pelo contato já cadastrado antes de gerar a senha."},400);
 const claimed=await admin.rpc("access_recovery_claim",{p_request:b.id,p_actor:uid,p_decision:b.decision,p_reason:b.reason||null});
 if(claimed.error)return reply({error:claimed.error.message||"Não foi possível analisar a recuperação."},400);
 const target=claimed.data;if(!target?.user_id)throw Error("Não foi possível conferir o destinatário.");
 if(b.decision==="RECUSADO"){await audit("RECUPERACAO_RECUSADA",uid);return reply({message:"Solicitação recusada."})}
 let temporary="";while(temporary.length<8){const bytes=crypto.getRandomValues(new Uint8Array(16));for(const n of bytes){if(n<250&&temporary.length<8)temporary+=String(n%10)}}
 const changed=await admin.auth.admin.updateUserById(target.user_id,{password:temporary});
 if(changed.error){await admin.from("access_recovery_requests").update({status:"PENDENTE"}).eq("id",b.id).eq("status","PROCESSANDO");throw Error("Não foi possível gerar a senha. A solicitação continua aguardando análise.")}
 const completed=await admin.from("access_recovery_requests").update({status:"ATENDIDO"}).eq("id",b.id).eq("status","PROCESSANDO");
 await audit(completed.error?"RECUPERACAO_SENHA_GERADA_REGISTRO_PENDENTE":"RECUPERACAO_SENHA_GERADA",uid);
 return reply({temporary_password:temporary,name:target.nome,whatsapp:target.whatsapp,message:completed.error?"Senha temporária criada. Entregue ao titular verificado; o registro administrativo precisa ser conferido.":"Senha temporária criada. Entregue somente ao titular verificado no contato cadastrado. Ele deverá criar outra senha ao entrar."});
}
if(action==="SET_PASSWORD"){
if(typeof b.password!=="string"||!/^\d{6,}$/.test(b.password))return reply({error:"Use somente números, com no mínimo 6 dígitos."},400);
const updated=await admin.auth.admin.updateUserById(uid,{password:b.password});if(updated.error)throw Error("Não foi possível salvar a senha.");
const prof=await admin.from(table).update(fiscal?{must_change_password:false}:{trocar_senha:false}).eq(idcol,uid);if(prof.error)throw Error("Senha salva. Não foi possível concluir a atualização do perfil.");
await admin.from("access_recovery_requests").update({status:"UTILIZADO"}).eq("user_id",uid).eq("status","ATENDIDO");
await audit("SENHA_ALTERADA",uid);
const auth=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const signed=await auth.auth.signInWithPassword({email:u.data.user.email||"",password:b.password});
return reply({message:signed.data.session?"Senha alterada. Acesso atualizado.":"Senha alterada. Entre com a nova senha.",...(signed.data.session?{access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token}:{})});
}
const requests=await admin.from("access_requests").select("*").eq("user_id",uid);if(requests.error)throw Error("Falha ao conferir solicitações.");
const rows=requests.data||[],r=rows.find((x:any)=>x.app===app),managed=rows.some((x:any)=>x.managed_account);
if(action==="REQUEST"){
const birth=String(b.data_nascimento||p.data_nascimento||"");if(!validBirth(birth))return reply({error:"Informe data de nascimento válida."},400);
if(r)return reply({status:r.status,message:"Sua solicitação já foi registrada."});
if(!p.cpf||!(p.full_name||p.nome)||!p.whatsapp)return reply({error:"Peça ao admin para completar CPF, nome e WhatsApp do seu cadastro."},400);
const saved=await admin.from("access_requests").insert({user_id:uid,app,nome:p.full_name||p.nome,cpf:p.cpf,whatsapp:p.whatsapp,email:p.email||null,data_nascimento:birth,managed_account:managed});
if(saved.error)throw Error("Não foi possível enviar a solicitação.");await audit("SOLICITACAO_ENVIADA",uid);return reply({status:"PENDENTE",message:"Solicitação enviada. Aguarde aprovação do admin ou master."});
}
if(action==="USERS"){
if(!isAdmin)return reply({error:"Somente admin ou master aprovado pode consultar usuários."},403);
let query=admin.from(table).select("*").eq(fiscal?"active":"ativo",true).order(fiscal?"full_name":"nome");
if(!fiscal&&!frete)query=query.eq("empresa_id",p.empresa_id);
const found=await query;if(found.error)throw Error("Não foi possível carregar usuários ativos.");
let candidates=found.data||[];
if(fiscal){
 const own=await admin.from("user_establishments").select("establishment_id").eq("user_id",uid);if(own.error)throw Error("Não foi possível conferir unidades.");
 const units=(own.data||[]).map((x:any)=>x.establishment_id);
 const scopes=units.length?await admin.from("user_establishments").select("user_id").in("establishment_id",units):{data:[]};if(scopes.error)throw Error("Não foi possível conferir usuários das unidades.");
 const permitted=new Set((scopes.data||[]).map((x:any)=>x.user_id));candidates=candidates.filter((x:any)=>permitted.has(x[idcol]));
}
const ids=candidates.map((x:any)=>x[idcol]);
const grants=ids.length?await admin.from("access_requests").select("user_id,app,status,managed_account").in("user_id",ids):{data:[]};if(grants.error)throw Error("Não foi possível conferir acessos ativos.");
const users=candidates.filter((target:any)=>{
 if(target.status_aprovacao&&target.status_aprovacao!=="APROVADO")return false;
 const rows=(grants.data||[]).filter((x:any)=>x.user_id===target[idcol]),request=rows.find((x:any)=>x.app===app),managed=rows.some((x:any)=>x.managed_account);
 return managed?request?.status==="APROVADO":request?request.status==="APROVADO":legacyAllowed({...target,must_change_password:false,trocar_senha:false},app);
}).map((target:any)=>({id:target[idcol],nome:target.full_name||target.nome,cpf:target.cpf,whatsapp:target.whatsapp,email:target.email,role:target.role||target.perfil,changing:Boolean(target.must_change_password||target.trocar_senha),created_at:target.created_at}));
return reply({users,app,message:users.length+" usuário(s) com acesso ativo a este aplicativo."});
}
if(action==="QUEUE"){
if(!isAdmin)return reply({error:"Somente admin ou master aprovado pode analisar."},403);
let pending=await admin.from("access_requests").select("id,user_id,app,nome,cpf,whatsapp,email,data_nascimento,created_at").eq("status","PENDENTE").order("created_at");
if(pending.error)throw Error("Falha ao carregar fila.");
let items=pending.data||[];
if(!fiscal&&!frete){const ids=items.map((x:any)=>x.user_id);if(ids.length){const scoped=await admin.from("fc_perfis").select("user_id").eq("empresa_id",p.empresa_id).in("user_id",ids);if(scoped.error)throw Error("Falha ao conferir empresa.");const allowed=new Set((scoped.data||[]).map((x:any)=>x.user_id));items=items.filter((x:any)=>allowed.has(x.user_id))}}
const units=fiscal?await admin.from("user_establishments").select("establishment_id,establishments(code)").eq("user_id",uid):{data:[]};
const resets=await admin.from("access_recovery_requests").select("id,user_id,app,claimed_phone,claimed_birth,created_at").eq("status","PENDENTE").order("created_at");if(resets.error)throw Error("Não foi possível carregar recuperações.");
 const resetIds=(resets.data||[]).map((x:any)=>x.user_id),profiles=resetIds.length?await admin.from(table).select("*").in(idcol,resetIds):{data:[]};if(profiles.error)throw Error("Não foi possível conferir destinatários.");
 const targetUnits=fiscal&&resetIds.length?await admin.from("user_establishments").select("user_id,establishment_id").in("user_id",resetIds):{data:[]};if(targetUnits.error||units.error)throw Error("Não foi possível conferir unidades.");
 const ownUnits=new Set((units.data||[]).map((x:any)=>x.establishment_id));
 const recoveries=(resets.data||[]).flatMap((r:any)=>{const target=(profiles.data||[]).find((x:any)=>x[idcol]===r.user_id);if(!target||!fiscal&&!frete&&target.empresa_id!==p.empresa_id)return [];
 const scopes=(targetUnits.data||[]).filter((x:any)=>x.user_id===r.user_id);if(fiscal&&scopes.length&&!scopes.some((x:any)=>ownUnits.has(x.establishment_id)))return [];
 const master=["MASTER","ULTRA_ADMIN"].includes(target.role||target.perfil),canReset=!master||["MASTER","ULTRA_ADMIN"].includes(p.role||p.perfil);
 return [{...r,nome:target.full_name||target.nome,cpf:target.cpf,whatsapp:target.whatsapp,can_reset:canReset}];});
 return reply({roles:[{"value":"MASTER","label":"Master"},{"value":"ADMINISTRADOR","label":"Administrador"},{"value":"OPERADOR_GERAL","label":"Operador geral"},{"value":"OPERADOR_PATIO","label":"Operador de pátio"},{"value":"MOTORISTA","label":"Motorista"},{"value":"VENDEDOR_EXTERNO","label":"Vendedor externo"},{"value":"VENDEDOR_INTERNO","label":"Vendedor interno"}].filter(x=>x.value!=="MASTER"&&x.value!=="ADMINISTRADOR"||["MASTER","ULTRA_ADMIN"].includes(String(p.role||p.perfil))),pending:items,recoveries,units:units.data||[],message:items.length+" cadastro(s) e "+recoveries.length+" recuperação(ões) aguardando análise."});
}
if(action==="REVIEW"){
if(!isAdmin)return reply({error:"Somente admin ou master aprovado pode analisar."},403);
const reviewed=await admin.rpc("access_review_with_role",{p_request:b.id,p_actor:uid,p_decision:b.decision,p_role:typeof b.role==="string"?b.role:null,p_units:Array.isArray(b.units)?b.units:b.unit?[b.unit]:[],p_reason:b.reason||null});
if(reviewed.error)return reply({error:reviewed.error.message||"Não foi possível registrar a decisão."},400);
let metadataPending=false;
if(b.decision==="APROVADO"){
 const request=await admin.from("access_requests").select("user_id").eq("id",b.id).single();
 const target=request.data?.user_id?await admin.auth.admin.getUserById(request.data.user_id):null;
 if(request.error||target?.error||!target?.data.user)metadataPending=true;
 else{const synced=await admin.auth.admin.updateUserById(target.data.user.id,{app_metadata:{...target.data.user.app_metadata,role:reviewed.data.role}});metadataPending=Boolean(synced.error)}
 if(metadataPending)await audit("CADASTRO_METADATA_PENDENTE",uid);
}
await audit("CADASTRO_"+b.decision,uid);return reply({message:metadataPending?"Acesso aprovado e perfil salvo. A sincronização dos dados de autenticação precisa ser conferida pelo administrador.":b.decision==="APROVADO"?"Acesso aprovado e perfil salvo. O usuário já pode entrar neste aplicativo.":"Acesso recusado. O usuário verá o motivo na sua tela de acesso.",...reviewed.data});
}
if(action!=="STATUS")return reply({error:"Ação inválida."},400);
const active=Boolean(p.active??p.ativo)&&(!p.status_aprovacao||p.status_aprovacao==="APROVADO"),changing=Boolean(p.must_change_password||p.trocar_senha);
const approved=managed?r?.status==="APROVADO":r?r.status==="APROVADO":legacyAllowed(p,app);
const notes=r?await admin.from("access_notifications").select("id,event,message,created_at").eq("user_id",uid).eq("request_id",r.id).eq("audience","USER").order("created_at",{ascending:false}).limit(5):{data:[]};
return reply({allowed:Boolean(approved&&active&&!changing),status:r?.status||(approved?"APROVADO":"SEM_SOLICITACAO"),isAdmin,changing,cpf:p.cpf,name:p.full_name||p.nome,notifications:notes.data||[]});
}catch(error){
if(admin&&createdId){await admin.from("access_requests").delete().eq("user_id",createdId);await admin.from("access_notifications").delete().eq("user_id",createdId);const fiscal=Deno.env.get("SUPABASE_URL")?.includes("xmfpvvmvdkepmnvtdoio"),frete=Deno.env.get("SUPABASE_URL")?.includes("nkynfboqwfxhhxcsrawl");if(frete)await admin.from("motoristas").delete().eq("auth_user_id",createdId);await admin.from(fiscal?"profiles":frete?"usuarios_app":"fc_perfis").delete().eq(fiscal?"id":"user_id",createdId);await admin.auth.admin.deleteUser(createdId)}
const message=error instanceof Error?error.message:"Não foi possível concluir. Tente novamente.";return reply({error:message},/^(Informe|CPF|E-mail|A senha)/.test(message)?400:503);
}
});
