import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'https://forte-frete.onrender.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const out=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return out(405,{error:'Método inválido.'});
 try{
  const authorization=req.headers.get('authorization')||'';
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return out(401,{error:'Sessão inválida.'});
  let body;try{body=await req.json()}catch{return out(400,{error:'JSON inválido.'})}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.viagem_id||''))return out(400,{error:'Identificador inválido.'});
  const actions={iniciar_carregamento:'INICIAR_CARREGAMENTO',iniciar_viagem:'INICIAR_VIAGEM',concluir_viagem:'CONCLUIR_VIAGEM'};
  const action=Object.hasOwn(actions,body?.acao)?actions[body.acao as keyof typeof actions]:null;
  if(!action)return out(400,{error:'Ação inválida.'});
  // Legacy clients use the same authenticated, atomic transition rules as the current app.
  const {data,error}=await client.rpc('frete_operacao',{p_acao:action,p_id:body.viagem_id});
  if(error)return out(error.code==='42501'?403:409,{error:'Viagem indisponível ou transição não autorizada. Atualize e confira.'});
  return out(200,data);
 }catch{return out(500,{error:'Falha ao atualizar viagem.'})}
});
