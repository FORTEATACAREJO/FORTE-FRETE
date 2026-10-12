import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {directoryRows,DRIVER_FIELDS} from './directory.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json','Cache-Control':'no-store'};
const SOURCES={
 vendas:{url:'https://gtwecfyffjszghnvtlzr.supabase.co',key:'sb_publishable_RP8g0VoZdWh8e9R7Nb9mYw_GSXjSuD3'},
 fiscal:{url:'https://xmfpvvmvdkepmnvtdoio.supabase.co',key:'sb_publishable_Uzonf-sIp5_KjKZHiALDVg_azIvZcKW'}
};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 try{
  if(req.method!=='POST')return Response.json({error:'Método inválido.'},{status:405,headers});
  const body=await req.json(),source=SOURCES[body.source],auth=req.headers.get('Authorization')||'';
  if(!source)return Response.json({error:'Aplicativo inválido.'},{status:400,headers});
  const caller=createClient(source.url,source.key,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await caller.auth.getUser();
  if(error||!user)return Response.json({error:'Entre novamente no sistema.'},{status:401,headers});
  if(body.source==='vendas'){
   const {data:p,error}=await caller.from('fc_perfis').select('empresa_id,ativo,status_aprovacao,trocar_senha').eq('user_id',user.id).single();
   if(error||p.empresa_id!=='49832961-0000-4000-8000-000000000001'||!p.ativo||p.status_aprovacao!=='APROVADO'||p.trocar_senha)return Response.json({error:'Acesso não aprovado.'},{status:403,headers});
  }else{
   const {data:p,error}=await caller.from('profiles').select('active,must_change_password').eq('id',user.id).single();
   const units=await caller.from('user_establishments').select('establishment_id').eq('user_id',user.id);
   if(error||!p.active||p.must_change_password||units.error||!units.data?.length)return Response.json({error:'Acesso fiscal não aprovado.'},{status:403,headers});
  }
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const found=await admin.from('motoristas').select(DRIVER_FIELDS).in('status_cadastro',['aprovado','legado']).order('nome');
  if(found.error)throw found.error;
  return Response.json({motoristas:directoryRows(found.data||[]),origem:'FORTE FRETE'},{headers});
 }catch(e){return Response.json({error:e.message||'Não foi possível consultar o Forte Frete.'},{status:400,headers});}
});