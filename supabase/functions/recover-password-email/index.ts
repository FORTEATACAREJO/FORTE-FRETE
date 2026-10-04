import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const origins = new Set(["https://forte-frete.onrender.com", "http://localhost:5173"]);
const originDefault = "https://forte-frete.onrender.com";
const normalizePhone = (v: unknown) => {const d=String(v??"").replace(/\D/g, "");return d.length===10||d.length===11?"55"+d:d;};
const generic = "Se os dados corresponderem ao cadastro autorizado, enviaremos o link pelo canal escolhido.";
Deno.serve(async (req: Request) => {
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:originDefault,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store",Vary:"Origin"};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST"||!origins.has(origin))return reply({error:"REQUISIÇÃO NÃO PERMITIDA."},403);
 try{
  const body=await req.json();
  const raw=String(body.identificador||"").trim().toLowerCase();
  const value=raw.replace(/\D/g,"");
  const channel=body.canal;
  const phone=normalizePhone(body.whatsapp);
  const contactEmail=String(body.email||"").trim().toLowerCase();
  if(raw.includes("@")||!/^\d{11}$/.test(value)||!["email","whatsapp"].includes(channel))return reply({error:"INFORME O CPF E ESCOLHA E-MAIL OU WHATSAPP."},400);
  if(channel==="whatsapp"&&!/^55\d{10,11}$/.test(phone))return reply({error:"INFORME O WHATSAPP CADASTRADO COM DDD."},400);
  if(channel==="email"&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail))return reply({error:"INFORME O E-MAIL CADASTRADO."},400);
  const token=Deno.env.get("WHATSAPP_ACCESS_TOKEN"),phoneId=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"),template=Deno.env.get("WHATSAPP_RECOVERY_TEMPLATE");
  if(channel==="whatsapp"&&(!token||!phoneId||!template))return reply({error:"A RECUPERAÇÃO POR WHATSAPP AINDA NÃO ESTÁ ATIVADA. ESCOLHA E-MAIL OU CONTATE O ADMINISTRADOR."},503);
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const hmacKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",hmacKey,new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,"0")).join("");
  const now=Date.now(),bucket=Math.floor(now/60000),previous=bucket-1;
  const keys=[await hash("recovery:"+value+":"+bucket),await hash("recovery:"+value+":"+previous)];
  const rate=await admin.from("password_recovery_limits").insert(keys.map(request_key=>({request_key,created_at:new Date(now).toISOString()})));
  if(rate.error?.code==="23505")return reply({error:"AGUARDE UM MINUTO ANTES DE SOLICITAR NOVAMENTE."},429);
  if(rate.error)throw new Error("rate_limit_storage");
  await admin.from("password_recovery_limits").delete().lt("created_at",new Date(now-86400000).toISOString());
  const query=admin.from("usuarios_app").select("user_id,email,whatsapp,status_aprovacao").in("status_aprovacao",["APROVADO","PENDENTE"]);
  const found=await query.eq("cpf",value).maybeSingle();
  if(found.error)throw new Error("account_lookup");
  let account=found.data?{user_id:found.data.user_id,email:found.data.email,whatsapp:found.data.whatsapp}:null;
  if(!account||(channel==="whatsapp"?normalizePhone(account.whatsapp)!==phone:String(account.email||"").trim().toLowerCase()!==contactEmail))return reply({message:generic});
  const user=await admin.auth.admin.getUserById(account.user_id);
  if(user.error)throw new Error("auth_lookup");
  const email=user.data.user?.email;
  if(!email)return reply({message:generic});
  if(channel==="email"){
   if(email.toLowerCase()!==contactEmail||email.endsWith("@acesso.forte.internal"))return reply({message:generic});
   const auth=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
   const sent=await auth.auth.resetPasswordForEmail(email,{redirectTo:originDefault+"/?recovery=1"});
   if(sent.error)throw new Error("email_delivery");
   return reply({message:generic});
  }
  const link=await admin.auth.admin.generateLink({type:"recovery",email,options:{redirectTo:originDefault+"/?recovery=1"}});
  if(link.error||!link.data.properties?.action_link)throw new Error("recovery_link");
  const actionLink=link.data.properties.action_link;
  const version=Deno.env.get("WHATSAPP_GRAPH_VERSION")||"v23.0";
  const components=[{type:"body",parameters:[{type:"text",text:actionLink}]}];
  const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:normalizePhone(account.whatsapp),type:"template",template:{name:template,language:{code:"pt_BR"},components}}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok||!result.messages?.[0]?.id)throw new Error("whatsapp_delivery");
  return reply({message:generic});
 }catch(error){console.error("PASSWORD_RECOVERY_FAILED",error instanceof Error?error.message:"unexpected");return reply({error:"NÃO FOI POSSÍVEL ENVIAR O LINK AGORA. TENTE NOVAMENTE EM ALGUNS MINUTOS."},503);}
});


