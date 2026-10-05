import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const origin="https://forte-frete.onrender.com";
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 const reply=(b:unknown,s=200)=>Response.json(b,{status:s,headers});
 if(req.method!=="POST"||req.headers.get("origin")!==origin)return reply({error:"REQUISIÇÃO NÃO PERMITIDA."},403);
 try{
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const user=await admin.auth.getUser((req.headers.get("authorization")||"").replace(/^Bearer\s+/i,""));
  if(user.error||!user.data.user)return reply({error:"SESSÃO INVÁLIDA."},401);
  const caller=await admin.from("usuarios_app").select("perfil,ativo,trocar_senha,status_aprovacao").eq("user_id",user.data.user.id).single();
  if(caller.error||!caller.data?.ativo||caller.data.status_aprovacao!=="APROVADO"||caller.data.trocar_senha||!["MASTER","ADMINISTRADOR"].includes(caller.data.perfil))return reply({error:"ACESSO EXCLUSIVO DO ADMINISTRADOR."},403);
  const b=await req.json(),nome=String(b.nome||"").trim(),cpf=String(b.cpf||"").replace(/\D/g,""),email=String(b.email||"").trim().toLowerCase(),perfil=String(b.perfil||"");
  let whatsapp=String(b.whatsapp||"").replace(/\D/g,"");if(/^\d{10,11}$/.test(whatsapp))whatsapp="55"+whatsapp;
  const cpfValid=()=>{if(!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf))return false;for(const n of[9,10]){let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);if((sum*10%11)%10!==Number(cpf[n]))return false}return true};
  if(nome.length<3||!cpfValid()||!/^55[1-9]\d[2-9]\d{7,8}$/.test(whatsapp)||(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))return reply({error:"CONFIRA NOME, CPF, E-MAIL E WHATSAPP."},400);
  if(!["MASTER","ADMINISTRADOR","OPERADOR_GERAL","OPERADOR_PATIO","MOTORISTA","VENDEDOR_EXTERNO","VENDEDOR_INTERNO"].includes(perfil)||(["MASTER","ADMINISTRADOR"].includes(perfil)&&caller.data.perfil!=="MASTER"))return reply({error:"PERFIL NÃO PERMITIDO."},403);
  const existing=await admin.from("usuarios_app").select("user_id").eq("cpf",cpf).maybeSingle();
  if(existing.error)throw new Error("lookup");if(existing.data)return reply({error:"CPF JÁ CADASTRADO. USE A RECUPERAÇÃO DE SENHA."},409);
  const random=Array.from(crypto.getRandomValues(new Uint32Array(4))).map(x=>String(x).padStart(10,"0")).join("");
  const created=await admin.auth.admin.createUser({email:email||`cpf.${cpf}@acesso.forte.internal`,password:random,email_confirm:true,user_metadata:{nome,cpf,whatsapp}});
  const uid=created.data.user?.id;if(created.error||!uid)return reply({error:"NÃO FOI POSSÍVEL CRIAR O ACESSO. CONFIRA SE O E-MAIL JÁ ESTÁ CADASTRADO."},409);
  const profile=await admin.from("usuarios_app").insert({user_id:uid,nome,cpf,email:email||null,whatsapp,perfil,ativo:["MASTER","ADMINISTRADOR"].includes(perfil),status_aprovacao:["MASTER","ADMINISTRADOR"].includes(perfil)?"APROVADO":"PENDENTE",trocar_senha:true});
  const driver=perfil==="MOTORISTA"&&!profile.error?await admin.from("motoristas").insert({auth_user_id:uid,nome,cpf,email:email||null,telefone:whatsapp,status_cadastro:"pre_cadastro"}):{error:null};
  if(profile.error||driver.error){await admin.auth.admin.deleteUser(uid);throw new Error("registration")}
  return reply({message:"CPF CADASTRADO. A PESSOA DEVE USAR CRIAR MINHA SENHA COM O E-MAIL OU WHATSAPP CADASTRADO.",url:origin});
 }catch{return reply({error:"NÃO FOI POSSÍVEL SALVAR O CADASTRO."},503)}
});

