import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {projects,isVaultMaster,validateCommand} from './policy.mjs';

Deno.serve(async request => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const ref = new URL(url).hostname.split('.')[0];
  const origin = request.headers.get('origin') || '';
  const allowed = projects[ref]?.includes(origin);
  const headers = {'Access-Control-Allow-Origin':allowed?origin:'null','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store',Vary:'Origin','X-Content-Type-Options':'nosniff'};
  const reply = (body:unknown,status=200) => Response.json(body,{status,headers});
  if (request.method === 'OPTIONS') return new Response(null,{status:allowed?204:403,headers});
  if (!allowed || request.method !== 'POST') return reply({error:'Requisição não permitida.'},403);
  const db = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return reply({error:'Entre no sistema para acessar o cofre.'},401);
    const jwt = authorization.replace(/^Bearer\s+/i,'');
    const {data,error} = await db.auth.getUser(jwt);
    if (error || !data.user) return reply({error:'Sessão inválida. Entre novamente.'},401);
    const fiscal = ref === 'xmfpvvmvdkepmnvtdoio',frete = ref === 'nkynfboqwfxhhxcsrawl';
    const profile = await db.from(fiscal?'profiles':frete?'usuarios_app':'fc_perfis').select('*').eq(fiscal?'id':'user_id',data.user.id).maybeSingle();
    if (profile.error || !isVaultMaster(profile.data)) return reply({error:'Somente Master ativo e aprovado pode administrar o cofre.'},403);
    // getUser validated this token. The database additionally checks that this session still exists.
    const claims = JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if (typeof claims.session_id !== 'string') return reply({error:'Entre novamente para acessar o cofre.'},401);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 100000) return reply({error:'Credencial excede o tamanho permitido.'},413);
    const body = JSON.parse(raw);
    let command;
    try { command = validateCommand(body); } catch { return reply({error:'Confira os campos do cofre.'},400); }
    const result = await db.rpc('integration_vault_manage',{p_actor:data.user.id,p_session:claims.session_id,p_action:body.action,p_data:command});
    // Never return database errors, request payloads or provider errors containing secrets.
    if (result.error) return reply({error:'Operação não concluída. Atualize o cofre e confira sua sessão e a versão do registro.'},409);
    return reply(result.data);
  } catch {
    return reply({error:'Não foi possível acessar o cofre. Confira os campos e tente novamente.'},400);
  }
});
