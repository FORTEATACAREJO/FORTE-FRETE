import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const origins=new Set(["https://forte-frete.onrender.com","http://localhost:5173"]);
const message="Se o cadastro existir, as instruções serão enviadas preferencialmente ao WhatsApp cadastrado.";
const hdr=(o:string)=>({"Access-Control-Allow-Origin":origins.has(o)?o:"https://forte-frete.onrender.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"});
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin")||"",headers=hdr(origin);
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST"||(origin&&!origins.has(origin)))return Response.json({error:"REQUISIÇÃO NÃO PERMITIDA."},{status:403,headers});
 try{
  const {identificador=""}=await req.json(),raw=String(identificador).trim().toLowerCase(),byEmail=raw.includes("@"),value=byEmail?raw:digits(raw);
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  let account:any=null;
  const uq=admin.from("usuarios_app").select("user_id,email,whatsapp").eq("ativo",true);
  const {data:u}=byEmail?await uq.ilike("email",value).maybeSingle():await uq.eq("cpf",value).maybeSingle();
  if(u)account=u;
  if(!account){const mq=admin.from("motoristas").select("auth_user_id,email,telefone");const{data:m}=byEmail?await mq.ilike("email",value).maybeSingle():await mq.eq("cpf",value).maybeSingle();if(m)account={user_id:m.auth_user_id,email:m.email,whatsapp:m.telefone};}
  let email=String(account?.email||"").trim().toLowerCase();
  if(!email&&account?.user_id){const au=await admin.auth.admin.getUserById(account.user_id);email=String(au.data.user?.email||"").trim().toLowerCase();}
  const whatsapp=digits(account?.whatsapp).replace(/^0+/,"");
  if(email){
   const link=await admin.auth.admin.generateLink({type:"recovery",email,options:{redirectTo:"https://forte-frete.onrender.com/?recovery=1"}});
   const actionLink=link.data.properties?.action_link,token=Deno.env.get("WHATSAPP_ACCESS_TOKEN"),phoneId=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"),template=Deno.env.get("WHATSAPP_RECOVERY_TEMPLATE");
   let sent=false;
   if(actionLink&&whatsapp&&token&&phoneId&&template){const r=await fetch(`https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSION")||"v23.0"}/${phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:whatsapp,type:"template",template:{name:template,language:{code:"pt_BR"},components:[{type:"body",parameters:[{type:"text",text:actionLink}]}]}})});sent=r.ok;}
   if(!sent&&!email.endsWith("@acesso.forte.internal")){const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false}});await client.auth.resetPasswordForEmail(email,{redirectTo:"https://forte-frete.onrender.com/?recovery=1"});}
  }
 }catch(e){console.error("RECOVERY_ERROR",String(e?.message||e))}
 return Response.json({message},{headers});
});
