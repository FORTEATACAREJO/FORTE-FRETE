import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const origin='https://forte-frete.onrender.com';
Deno.serve(async req=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(x:unknown,status=200)=>Response.json(x,{status,headers});
 if(req.headers.get('origin')!==origin)return reply({error:'Origem não autorizada.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const ok=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data};
 try{
  const b=await req.json(),action=b.action||'DRAFT';
  const stored=ok(await db.rpc('driver_whatsapp_read'))||{};
  const token=stored.token||Deno.env.get('WHATSAPP_ACCESS_TOKEN'),phone=stored.phone_id||Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')||Deno.env.get('WHATSAPP_PHONE_ID'),waba=stored.waba_id||Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID')||Deno.env.get('WHATSAPP_WABA_ID'),version=stored.graph_version||Deno.env.get('WHATSAPP_GRAPH_VERSION')||'v26.0',templateName=stored.template_name||Deno.env.get('WHATSAPP_DRIVER_INVITE_TEMPLATE');
  if(action==='PUBLIC_CAPABILITIES')return reply({business_credentials:Boolean(token&&phone),template_configured:Boolean(templateName),signup:true});
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const identity=await db.auth.getUser(jwt);if(identity.error||!identity.data.user)return reply({error:'Entre novamente para continuar.'},401);const uid=identity.data.user.id;
  const profile=ok(await db.from('usuarios_app').select('*').eq('user_id',uid).single());
  const admin=profile.ativo&&profile.status_aprovacao==='APROVADO'&&!profile.trocar_senha&&['MASTER','ADMINISTRADOR'].includes(profile.perfil);
  if(['INVITE','SEND','INVITES','TEMPLATES','CONFIGURE'].includes(action)){
   if(!admin)return reply({error:'Somente administração pode gerenciar convites.'},403);
   if(action==='CONFIGURE'){
    const t=String(b.token||''),p=String(b.phone_id||''),w=String(b.waba_id||''),name='forte_frete_convite';
    if(t.length<30||!/^\d+$/.test(p)||!/^\d+$/.test(w))throw Error('Informe token de acesso, ID do número e ID da conta WhatsApp Business.');
    const authHeaders={Authorization:'Bearer '+t};
    const phoneCheck=await fetch(`https://graph.facebook.com/${version}/${w}/phone_numbers?fields=id,display_phone_number&limit=100`,{headers:authHeaders,signal:AbortSignal.timeout(15000)});const numbers=await phoneCheck.json();
    if(!phoneCheck.ok||!numbers.data?.some((n:any)=>n.id===p))throw Error('Token inválido, sem permissão ou número não pertence à conta informada.');
    const query=await fetch(`https://graph.facebook.com/${version}/${w}/message_templates?name=${name}&fields=name,status,language,components`,{headers:authHeaders,signal:AbortSignal.timeout(15000)});const templates=await query.json();if(!query.ok)throw Error('Token sem permissão para consultar modelos de mensagem.');
    let status=templates.data?.find((x:any)=>x.name===name&&x.language==='pt_BR')?.status;
    if(!status){
     const created=await fetch(`https://graph.facebook.com/${version}/${w}/message_templates`,{method:'POST',headers:{...authHeaders,'Content-Type':'application/json'},body:JSON.stringify({name,language:'pt_BR',category:'MARKETING',components:[{type:'BODY',text:'Olá, {{1}}! A Forte Atacarejo convida você a se cadastrar no Forte Frete. Crie seu acesso e envie os documentos do motorista, veículos e dados Pix pelo link: {{2}}',example:{body_text:[['Motorista','https://forte-frete.onrender.com/?cadastro=motorista']]}}]}),signal:AbortSignal.timeout(20000)});const response=await created.json();if(!created.ok)throw Error('Meta recusou a criação do modelo. Confira permissões e a conta.');status=response.status||'PENDING';
    }
    ok(await db.rpc('driver_whatsapp_save',{p_actor:uid,p_token:t,p_phone:p,p_waba:w,p_template:name,p_version:version}));
    return reply({message:status==='APPROVED'?'Credenciais verificadas e modelo aprovado. Envio Business disponível.':'Credenciais verificadas e salvas no cofre. Modelo enviado à Meta; aguarde aprovação antes de enviar convites.',template_status:status});
   }
   if(action==='INVITES')return reply({invites:ok(await db.from('convites_motorista').select('id,codigo,ativo,expires_at,target_phone,recipient_name,send_status,send_error,total_cadastros,created_at').order('created_at',{ascending:false}).limit(30)),business_credentials:Boolean(token&&phone),template_configured:Boolean(templateName)});
   if(action==='TEMPLATES'){
    if(!token||!waba)return reply({templates:[],message:'Credenciais e ID da conta WhatsApp Business ainda não configurados no Forte Frete.'});
    const r=await fetch(`https://graph.facebook.com/${version}/${waba}/message_templates?fields=name,status,language,components&limit=100`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});const q=await r.json();if(!r.ok)throw Error('Meta não permitiu consultar modelos. Confira token e permissões.');return reply({templates:(q.data||[]).filter((t:any)=>t.status==='APPROVED')});
   }
   if(action==='INVITE'){
    let target=String(b.whatsapp||'').replace(/\D/g,'');if(/^\d{10,11}$/.test(target))target='55'+target;
    if(target&&!/^55[1-9]\d[2-9]\d{7,8}$/.test(target))throw Error('WhatsApp inválido. Informe DDD.');
    const name=String(b.nome||'').trim().slice(0,100);
    const invite=ok(await db.from('convites_motorista').insert({criado_por_admin:uid,uso_ilimitado:!target,target_phone:target||null,recipient_name:name||null,expires_at:new Date(Date.now()+30*86400000).toISOString()}).select('id,codigo').single());
    return reply({invite,link:origin+'/?cadastro=motorista&codigo='+invite.codigo,message:'Link criado. O motorista preenche o CPF e cria a própria senha.'});
   }
   const invite=ok(await db.from('convites_motorista').select('*').eq('id',b.id).single());
   if(!invite.ativo||Date.parse(invite.expires_at)<Date.now())throw Error('Convite expirado ou cancelado. Gere outro.');
   if(!invite.target_phone)throw Error('Gere convite direcionado a um WhatsApp para enviar pela API.');
   if(!b.opt_in)throw Error('Confirme que o motorista autorizou receber o convite.');
   if(!token||!phone)return reply({error:'Envio automático indisponível: faltam credenciais do WhatsApp Business no Forte Frete. O link pode ser compartilhado pelo WhatsApp.'},409);
   if(invite.send_status==='ACCEPTED_BY_META')return reply({message:'Convite já aceito pela Meta para envio.',status:invite.send_status});
   if(invite.send_status==='SENDING')throw Error('Envio em processamento. Atualize a situação antes de tentar novamente.');
   const template=templateName;if(!template) return reply({error:'Cadastre e aprove na Meta o modelo forte_frete_convite com dois parâmetros no corpo: nome e link. Depois configure WHATSAPP_DRIVER_INVITE_TEMPLATE.'},409);
   const lock=ok(await db.from('convites_motorista').update({send_status:'SENDING',send_started_at:new Date().toISOString(),send_error:null}).eq('id',invite.id).in('send_status',['LINK_CREATED','FAILED']).select('id'));if(!lock.length)throw Error('Convite já foi enviado ou está em processamento.');
   const link=origin+'/?cadastro=motorista&codigo='+invite.codigo;
   try{
    const r=await fetch(`https://graph.facebook.com/${version}/${phone}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:invite.target_phone,type:'template',template:{name:template,language:{code:Deno.env.get('WHATSAPP_DRIVER_INVITE_LANGUAGE')||'pt_BR'},components:[{type:'body',parameters:[{type:'text',text:invite.recipient_name||'motorista'},{type:'text',text:link}]}]}}),signal:AbortSignal.timeout(20000)});const q=await r.json();
    if(!r.ok||!q.messages?.[0]?.id){ok(await db.from('convites_motorista').update({send_status:'FAILED',send_error:'Meta recusou o envio. Código '+String(q.error?.code||r.status)}).eq('id',invite.id));return reply({error:'Meta recusou o convite. Confira o modelo aprovado e as credenciais.'},502);}
    ok(await db.from('convites_motorista').update({send_status:'ACCEPTED_BY_META',meta_message_id:q.messages[0].id}).eq('id',invite.id));return reply({status:'ACCEPTED_BY_META',message:'Meta aceitou o convite para envio. A entrega no telefone ainda não foi confirmada.'});
   }catch(e){await db.from('convites_motorista').update({send_error:'Resultado do envio não confirmado. Verifique antes de reenviar.'}).eq('id',invite.id);throw e;}
  }
  const driver=ok(await db.from('motoristas').select('*').eq('auth_user_id',uid).maybeSingle());
  if(!driver||profile.perfil!=='MOTORISTA')return reply({needs_documents:false});
  const needs=['pre_cadastro','pendencia','reprovado'].includes(driver.status_cadastro)&&profile.status_aprovacao!=='APROVADO';
  let draft=ok(await db.from('driver_onboarding').select('*').eq('user_id',uid).maybeSingle());
  if(action==='DRAFT')return reply({needs_documents:needs,driver:{nome:driver.nome,cpf:driver.cpf,telefone:driver.telefone},draft});
  if(!needs)return reply({error:'Cadastro não está aberto para edição.'},409);
  if(!draft){draft=ok(await db.from('driver_onboarding').insert({user_id:uid,motorista_id:driver.id}).select('*').single());}
  if(action==='CLAIM'){
   const code=String(b.codigo||'');if(code)ok(await db.rpc('driver_onboarding_claim',{p_user:uid,p_code:code}));
   return reply({needs_documents:true});
  }
  if(action==='UPLOAD'){
   const kinds=['cnh_frente','cnh_verso','cavalo','carreta_1','dolly','carreta_2','rntrc','foto_conjunto','pix_comprovante'];if(!kinds.includes(b.kind)||!['application/pdf','image/jpeg','image/png','image/webp'].includes(b.mime)||!Number.isFinite(b.size)||b.size<=0||b.size>10*1024*1024)throw Error('Use PDF, JPG, PNG ou WebP de até 10 MB.');
   const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[b.mime as string];const path=`${uid}/${crypto.randomUUID()}_${b.kind}.${ext}`;const signed=ok(await db.storage.from('motorista-documentos').createSignedUploadUrl(path));return reply({path,token:signed.token});
  }
  if(action==='SAVE'){
   if(JSON.stringify(b.data||{}).length>30000)throw Error('Cadastro excede o tamanho permitido.');
   const data:any={};for(const k of ['plate','capacity','vehicle_type','city','cnh_number','cnh_category','cnh_validity','owner_name','owner_document','beneficiary_name','beneficiary_document','bank','pix_type','pix_key','files','plates','absent'])if(b.data?.[k]!==undefined)data[k]=b.data[k];
   for(const path of Object.values(data.files||{})){if(typeof path!=='string'||!path.startsWith(uid+'/'))throw Error('Anexo não pertence ao seu cadastro.');}
   ok(await db.rpc('driver_onboarding_save',{p_user:uid,p_data:data}));return reply({message:'Rascunho salvo. Você pode continuar depois com CPF e senha.'});
  }
  if(action==='SUBMIT'){const result=ok(await db.rpc('driver_onboarding_submit',{p_user:uid}));return reply({...result,message:'Cadastro completo enviado para análise. Aguarde aprovação da administração.'});}
  return reply({error:'Ação inválida.'},400);
 }catch(e){return reply({error:e instanceof Error?e.message:'Não foi possível concluir.'},400);}
});
