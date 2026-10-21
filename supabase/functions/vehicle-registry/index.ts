import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const origin='https://forte-frete.onrender.com';
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const kinds=['cavalo','carreta_1','dolly','carreta_2','rntrc','foto_frente','foto_lateral','pix_comprovante'];
const fields=['vehicle_type','plate','brand','model','year','capacity','owner_name','owner_document','owner_whatsapp','payment_method','beneficiary_name','beneficiary_document','bank','pix_type','pix_key','absent','plates','files','declaracao'];
Deno.serve(async req=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(req.headers.get('origin')!==origin)return reply({error:'Origem não autorizada.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const ok=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
 try{
  const auth=await db.auth.getUser((req.headers.get('authorization')||'').replace(/^Bearer\s+/i,''));
  if(auth.error||!auth.data.user)return reply({error:'Entre novamente para continuar.'},401);
  const uid=auth.data.user.id,b=await req.json(),action=b.action||'LIST';
  const p=ok(await db.from('usuarios_app').select('ativo,status_aprovacao,trocar_senha,perfil,nome,cpf,whatsapp').eq('user_id',uid).single());
  if(p.trocar_senha)return reply({error:'Conclua a troca de senha.'},403);
  const admin=p.ativo&&p.status_aprovacao==='APROVADO'&&['MASTER','ADMINISTRADOR'].includes(p.perfil);
  const legal=ok(await db.rpc('forte_legal_status',{p_user:uid,p_app:'frete'}));
  if(legal.accepted!==true)return reply({error:'Aceite o termo vigente no Frete.'},428);
  const own=ok(await db.from('motoristas').select('id').eq('auth_user_id',uid).maybeSingle());
  const dossier=ok(await db.from('registration_dossiers').select('kind,status,data').eq('user_id',uid).maybeSingle());
  const candidate=['PENDENTE','APROVADO'].includes(p.status_aprovacao)&&(!!own||dossier?.kind==='MOTORISTA');
  if(!admin&&!candidate)return reply({error:'Cadastro de motorista indisponível.'},403);
  if(['ADMIN_LIST','REVIEW','LINK','UNLINK','DOCUMENTS'].includes(action)){
   if(!admin)return reply({error:'Somente a administração aprovada pode executar esta ação.'},403);
   if(action==='ADMIN_LIST')return reply({
    vehicles:ok(await db.from('veiculos_motorista').select('id,placa,tipo,ativo,status_aprovacao,motorista_id,capacidade_efetiva_t,capacidade_t,marca_modelo,ano_fabricacao,motivo_analise').order('placa')),
    drivers:ok(await db.from('motoristas').select('id,nome,status_cadastro,auth_user_id').order('nome')),
    requests:ok(await db.from('vehicle_link_requests').select('id,user_id,veiculo_id,status,created_at').eq('status','PENDENTE').order('created_at')),
    links:ok(await db.from('motorista_veiculo_vinculos').select('id,motorista_id,veiculo_id,iniciado_em,encerrado_em,motivo,origem').order('iniciado_em',{ascending:false}).limit(200))
   });
   if(!uuid(b.vehicle_id))throw Error('Veículo inválido.');
   if(action==='REVIEW')return reply(ok(await db.rpc('vehicle_registration_review',{p_actor:uid,p_id:b.vehicle_id,p_decision:b.decision,p_reason:String(b.reason||'').slice(0,1000)})));
   if(action==='LINK'||action==='UNLINK'){
    if(!uuid(b.driver_id))throw Error('Motorista inválido.');
    return reply(ok(await db.rpc('vehicle_registration_link',{p_actor:uid,p_vehicle:b.vehicle_id,p_driver:b.driver_id,p_unlink:action==='UNLINK',p_reason:String(b.reason||'').slice(0,1000)})));
   }
   const documents=ok(await db.from('documentos_veiculo').select('tipo,arquivo_path').eq('veiculo_id',b.vehicle_id));
   const attachments=[];
   for(const d of documents){const signed=ok(await db.storage.from('motorista-documentos').createSignedUrl(d.arquivo_path,300));attachments.push({kind:d.tipo,url:signed.signedUrl});}
   // Payment information is a proposal only. Approval never changes any payee or Pix key.
   const draft=ok(await db.from('vehicle_registration_drafts').select('data').eq('veiculo_id',b.vehicle_id).maybeSingle());
   const payment:any={};for(const k of ['payment_method','beneficiary_name','beneficiary_document','bank','pix_type','pix_key'])if(draft?.data?.[k])payment[k]=draft.data[k];
   return reply({attachments,payment,paymentStatus:'CONFERIR_NO_CADASTRO_DE_FAVORECIDOS'});
  }
  if(!candidate)return reply({error:'Use o cadastro administrativo de veículos.'},403);
  if(action==='LIST'){
   const drafts=ok(await db.from('vehicle_registration_drafts').select('id,veiculo_id,data,status,revision').eq('user_id',uid).order('updated_at',{ascending:false}));
   const query=db.from('veiculos_motorista').select('id,placa,tipo,status_aprovacao,motorista_id,capacidade_efetiva_t,motivo_analise');
   const vehicles=ok(await (own?query.or(`cadastrado_por.eq.${uid},motorista_id.eq.${own.id}`):query.eq('cadastrado_por',uid)));
   const legacyVehicleData:any={};for(const k of fields)if(dossier?.data?.[k]!==undefined)legacyVehicleData[k]=dossier.data[k];legacyVehicleData.files=Object.fromEntries(Object.entries(legacyVehicleData.files||{}).filter(([k])=>kinds.includes(k)));delete legacyVehicleData.declaracao;
   return reply({drafts,vehicles,legacyVehicleData,driverId:own?.id||null,personalStatus:dossier?.status||null,profile:{nome:p.nome,cpf:p.cpf,whatsapp:p.whatsapp}});
  }
  if(action==='REQUEST_LINK'){if(!uuid(b.vehicle_id))throw Error('Veículo inválido.');return reply(ok(await db.rpc('vehicle_registration_request_link',{p_user:uid,p_vehicle:b.vehicle_id})));}
  if(action==='LOOKUP'){
   const plate=String(b.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
   if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))throw Error('Informe a placa completa.');
   const rows=ok(await db.from('veiculos_motorista').select('id,placa,status_aprovacao').eq('placa',plate).limit(1));
   return reply({vehicle:rows[0]||null,message:rows.length?'Placa existente. Solicite à administração o vínculo com este veículo.':'Placa não localizada. Cadastre o veículo separadamente.'});
  }
  if(!uuid(b.id))throw Error('Rascunho inválido.');
  if(action==='SAVE'){
   if(!b.data||Array.isArray(b.data)||typeof b.data!=='object'||JSON.stringify(b.data).length>30000||!Number.isInteger(b.revision))throw Error('Dados ou revisão inválidos.');
   const data:any={};for(const k of fields)if(b.data[k]!==undefined)data[k]=b.data[k];
   if(data.files&&(typeof data.files!=='object'||Array.isArray(data.files)))throw Error('Anexos inválidos.');
   for(const [k,path] of Object.entries(data.files||{}))if(!kinds.includes(k)||typeof path!=='string'||!path.startsWith(uid+'/')||path.includes('..'))throw Error('Anexo pertence a outro cadastro ou é inválido.');
   return reply(ok(await db.rpc('vehicle_registration_save',{p_user:uid,p_id:b.id,p_revision:b.revision,p_data:data})));
  }
  const draft=ok(await db.from('vehicle_registration_drafts').select('id,status').eq('id',b.id).eq('user_id',uid).single());
  if(action==='SUBMIT')return reply(ok(await db.rpc('vehicle_registration_submit',{p_user:uid,p_id:draft.id})));
  if(action==='UPLOAD'){
   if(draft.status!=='DRAFT')return reply({error:'Cadastro já enviado.'},409);
   const photo=String(b.kind).startsWith('foto_'),extensions:any={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
   if(!kinds.includes(b.kind)||!extensions[b.mime]||(photo&&b.mime==='application/pdf')||!Number.isFinite(b.size)||b.size<=0||b.size>10485760)throw Error('Use arquivo permitido de até 10 MB; fotos devem ser imagens.');
   const path=`${uid}/${draft.id}/${crypto.randomUUID()}_${b.kind}.${extensions[b.mime]}`;
   return reply({path,token:ok(await db.storage.from('motorista-documentos').createSignedUploadUrl(path)).token});
  }
  return reply({error:'Ação inválida.'},400);
 }catch(e){return reply({error:e instanceof Error?e.message:'Não foi possível concluir.'},400);}
});
