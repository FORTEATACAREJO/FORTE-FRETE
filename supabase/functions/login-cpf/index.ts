import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const origins=new Set(["https://forte-frete.onrender.com", "http://localhost:5173"]);
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://forte-frete.onrender.com","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store",Vary:"Origin"};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 const fail=()=>reply({error:"CPF OU SENHA INVÁLIDOS, OU ACESSO NÃO AUTORIZADO."},401);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||!origins.has(origin))return reply({error:"REQUISIÇÃO NÃO PERMITIDA."},403);
 try{
  const b=await req.json(),raw=String(b.cpf||""),cpf=raw.replace(/\D/g,""),password=b.password;
  if(raw.includes("@")||!/^\d{11}$/.test(cpf)||typeof password!=="string"||!/^\d{6,}$/.test(password))return fail();
  const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const hkey=await crypto.subtle.importKey("raw",new TextEncoder().encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bucket=Math.floor(Date.now()/60000);
  let allowed=false;
  for(let slot=0;slot<5;slot++){
   const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",hkey,new TextEncoder().encode(`login:${cpf}:${bucket}:${slot}`)));
   const request_key=Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("");
   const rate=await admin.from("password_recovery_limits").insert({request_key});
   if(!rate.error){allowed=true;break}if(rate.error.code!=="23505")return fail();
  }
  if(!allowed)return reply({error:"MUITAS TENTATIVAS. AGUARDE UM MINUTO."},429);
  const found=await admin.from("usuarios_app").select("user_id,ativo,status_aprovacao,perfil").eq("cpf",cpf).limit(2);
  if(found.error||found.data?.length!==1)return fail();
  const account=found.data[0];
  if(account.status_aprovacao==='PENDENTE'&&account.perfil==='MOTORISTA'){
   const dossier=await admin.from("motoristas").select("status_cadastro").eq("auth_user_id",account.user_id).maybeSingle();
   if(dossier.error||!dossier.data||!["pre_cadastro","pendencia","em_analise"].includes(dossier.data.status_cadastro))return fail();
  }else if(!account.ativo||account.status_aprovacao!=="APROVADO")return fail();
  const user=await admin.auth.admin.getUserById(found.data[0].user_id);
  if(user.error||!user.data.user?.email)return fail();
  const auth=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await auth.auth.signInWithPassword({email:user.data.user.email,password});
  if(login.error||!login.data.session)return fail();
  return reply({access_token:login.data.session.access_token,refresh_token:login.data.session.refresh_token});
 }catch{return fail()}
});
