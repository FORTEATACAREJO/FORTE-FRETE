import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const origin='https://forte-frete.onrender.com';
Deno.serve(async request=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(request.headers.get('origin')!==origin)return reply({error:'Origem não permitida.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'Use POST.'},405);
 try{
  const jwt=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await db.auth.getUser(jwt);if(auth.error||!auth.data.user)return reply({error:'Entre novamente.'},401);
  const profile=await db.from('usuarios_app').select('perfil,ativo,status_aprovacao,trocar_senha').eq('user_id',auth.data.user.id).maybeSingle();
  if(profile.error||!profile.data?.ativo||profile.data.status_aprovacao!=='APROVADO'||profile.data.trocar_senha||!['MASTER','ADMINISTRADOR'].includes(profile.data.perfil))return reply({error:'Análise disponível apenas para a administração aprovada.'},403);
  const body=await request.json();if(body.action!=='ASSESS'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id||''))return reply({error:'Informe um protocolo de exclusão válido.'},400);
  const claims=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(!claims.session_id)return reply({error:'Entre novamente.'},401);
  const result=await db.rpc('frete_deletion_assess',{p_actor:auth.data.user.id,p_session:claims.session_id,p_request:body.id});
  if(result.error)return reply({error:'Não foi possível analisar. Confira o protocolo e sua sessão.'},409);
  return reply(result.data);
 }catch{return reply({error:'Não foi possível concluir a análise.'},400)}
});
