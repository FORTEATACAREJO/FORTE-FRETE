import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const origin='https://forte-frete.onrender.com';
const kinds=['identificacao','cnh_frente','cnh_verso','cavalo','carreta_1','dolly','carreta_2','rntrc','foto_frente','foto_lateral','pix_comprovante'];
Deno.serve(async req=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(x:unknown,status=200)=>Response.json(x,{status,headers});
 if(req.headers.get('origin')!==origin)return reply({error:'Origem não autorizada.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const ok=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data};
 try{
  const user=await db.auth.getUser((req.headers.get('authorization')||'').replace(/^Bearer\s+/i,''));if(user.error||!user.data.user)return reply({error:'Entre novamente para continuar.'},401);
  const uid=user.data.user.id,b=await req.json(),action=b.action||'DRAFT';
  const p=ok(await db.from('usuarios_app').select('*').eq('user_id',uid).single());
  const admin=p.ativo&&p.status_aprovacao==='APROVADO'&&!p.trocar_senha&&['MASTER','ADMINISTRADOR'].includes(p.perfil);
  if(['REVIEW','CORRECTION','LINK_LEGACY'].includes(action)){const legal=await db.rpc('forte_legal_status',{p_user:uid,p_app:'frete'});if(legal.error||legal.data?.accepted!==true)return reply({error:'Aceite pendente do termo vigente no Frete.'},428);

   if(!admin)return reply({error:'Somente Master ou Admin aprovado pode revisar.'},403);
   if(action==='LINK_LEGACY'){if(b.confirmed!==true)throw Error('Confirme a conferência da CNH e da identidade antes de vincular.');return reply(ok(await db.rpc('registration_link_legacy_driver',{p_actor:uid,p_user:b.user_id,p_driver:b.driver_id})));}
   if(action==='CORRECTION')return reply(ok(await db.rpc('registration_dossier_correction',{p_actor:uid,p_user:b.user_id,p_reason:b.reason})));
   const dossier=ok(await db.from('registration_dossiers').select('*').eq('user_id',b.user_id).maybeSingle());
   if(!dossier)return reply({dossier:null,attachments:[]});
   const attachments=[];for(const [kind,path]of Object.entries(dossier.data.files||{})){const signed=ok(await db.storage.from('motorista-documentos').createSignedUrl(path as string,300));attachments.push({kind,url:signed.signedUrl});}
   const legacy=dossier.kind==='MOTORISTA'?ok(await db.rpc('registration_legacy_match',{p_actor:uid,p_user:b.user_id})):null;
   return reply({dossier,attachments,legacy});
  }
  const d=ok(await db.from('registration_dossiers').select('*').eq('user_id',uid).maybeSingle());
  const pending=ok(await db.from('access_requests').select('id').eq('user_id',uid).eq('app','frete').eq('status','PENDENTE').limit(1).maybeSingle());
  const editable=!!pending&&!p.ativo&&p.status_aprovacao==='PENDENTE'&&!p.trocar_senha&&d?.status==='DRAFT';
  if(action==='DRAFT')return reply({dossier:d,editable,profile:{nome:p.nome,cpf:p.cpf,email:p.email,whatsapp:p.whatsapp,data_nascimento:p.data_nascimento}});
  if(!editable)return reply({error:'Cadastro não está aberto para edição.'},409);
  if(action==='UPLOAD'){
   const allowed=d.kind==='MOTORISTA'?kinds.filter(k=>k!=='identificacao'):['identificacao'];
   const photo=['foto_frente','foto_lateral'].includes(b.kind),mime=['image/jpeg','image/png','image/webp',...(photo?[]:['application/pdf'])];
   if(!allowed.includes(b.kind)||!mime.includes(b.mime)||!Number.isFinite(b.size)||b.size<=0||b.size>10*1024*1024)throw Error('Use arquivo permitido de até 10 MB; fotos devem ser imagens.');
   const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[b.mime as string],path=`${uid}/${crypto.randomUUID()}_${b.kind}.${ext}`;
   return reply({path,token:ok(await db.storage.from('motorista-documentos').createSignedUploadUrl(path)).token});
  }
  if(action==='SAVE'){
   if(!b.data||Array.isArray(b.data)||typeof b.data!=='object'||JSON.stringify(b.data).length>30000)throw Error('Dados inválidos.');
   const data:any={};const fields=['cep','logradouro','numero','complemento','bairro','cidade','uf','declaracao','files'];
   if(d.kind==='MOTORISTA')fields.push('city','cnh_number','cnh_category','cnh_validity','vehicle_type','plate','brand','model','year','capacity','owner_name','owner_document','owner_whatsapp','payment_method','beneficiary_name','beneficiary_document','bank','pix_type','pix_key','absent','plates');
   for(const k of fields)if(b.data[k]!==undefined)data[k]=b.data[k];
   const allowed=d.kind==='MOTORISTA'?kinds.filter(k=>k!=='identificacao'):['identificacao'];
   if(data.files&&(typeof data.files!=='object'||Array.isArray(data.files)))throw Error('Anexos inválidos.');
   for(const [k,path]of Object.entries(data.files||{}))if(!allowed.includes(k)||typeof path!=='string'||!path.startsWith(uid+'/')||path.includes('..'))throw Error('Anexo inválido ou pertence a outro cadastro.');
   const result=ok(await db.rpc('registration_dossier_save',{p_user:uid,p_data:data,p_revision:b.revision}));return reply(result);
  }
  if(action==='SUBMIT')return reply(ok(await db.rpc('registration_dossier_submit',{p_user:uid})));
  return reply({error:'Ação inválida.'},400);
 }catch(e){return reply({error:e instanceof Error?e.message:'Não foi possível concluir.'},400);}
});
