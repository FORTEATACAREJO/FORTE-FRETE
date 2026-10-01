import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const origins=new Set(["https://forte-frete.onrender.com","http://localhost:5173"]);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://forte-frete.onrender.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST'||!origins.has(origin))return reply({error:'REQUISIÇÃO NÃO PERMITIDA.'},403);
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const identity=await admin.auth.getUser(token);
  if(identity.error||!identity.data.user)return reply({error:'LINK EXPIRADO. Solicite um novo link de recuperação.'},401);
  const uid=identity.data.user.id;
  const account=await admin.from('usuarios_app').select('ativo').eq('user_id',uid).single();
  if(account.error||!account.data.ativo)return reply({error:'ACESSO NÃO AUTORIZADO.'},403);
  const {password}=await req.json();
  if(typeof password!=='string'||!/^\d{6}$/.test(password))return reply({error:'USE EXATAMENTE SEIS NÚMEROS.'},400);
  const saved=await admin.auth.admin.updateUserById(uid,{password});
  if(saved.error)return reply({error:'NÃO FOI POSSÍVEL SALVAR A SENHA.'},400);
  const released=await admin.from('usuarios_app').update({trocar_senha:false}).eq('user_id',uid).select('user_id').single();
  if(released.error)return reply({error:'SENHA SALVA, MAS A LIBERAÇÃO FALHOU. TENTE NOVAMENTE.'},503);
  return reply({message:'Senha salva. Entre com CPF e a nova senha de seis números.'});
 }catch{return reply({error:'NÃO FOI POSSÍVEL SALVAR A SENHA AGORA.'},503)}
});
