import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const cors={"Access-Control-Allow-Origin":"https://forte-frete.onrender.com","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:cors});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST") return out(405,{error:"Método inválido"});
 try{
  const url=Deno.env.get("SUPABASE_URL")!, key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const {data:{user},error:ue}=await admin.auth.getUser(token);
  if(ue||!user) return out(401,{error:"Sessão inválida"});
  const {carga_id}=await req.json();
  const {data:m}=await admin.from("motoristas").select("id,nome,cpf,telefone,status_cadastro").eq("auth_user_id",user.id).maybeSingle();
  if(!m||m.status_cadastro!=="aprovado") return out(403,{error:"Motorista ainda não aprovado"});
  const {data:c}=await admin.from("cargas").select("*").eq("id",carga_id).eq("status","publicada").maybeSingle();
  if(!c) return out(409,{error:"Carga não está mais disponível"});
  const {data:v}=await admin.from("veiculos_motorista").select("*").eq("motorista_id",m.id).eq("ativo",true).order("conjunto_principal",{ascending:false}).limit(1).maybeSingle();
  const cap=Number(v?.capacidade_efetiva_t??v?.capacidade_t??0);
  const minimo=Number(c.peso_min_t??36),maximo=Number(c.peso_max_t??52);
  if(!v||![cap,minimo,maximo].every(Number.isFinite)||minimo<=0||maximo<minimo||cap<minimo||cap>maximo) return out(409,{error:"Capacidade do conjunto fora da faixa desta carga"});
  const peso=Math.min(cap,maximo);
  const unit=Number(c.peso_unitario_kg??50);
  const tarifa=Number(c.frete_por_t);
  if(!Number.isFinite(unit)||unit<=0||c.frete_por_t==null||!Number.isFinite(tarifa)||tarifa<0) return out(409,{error:"Peso unitário ou tarifa de frete inválidos"});
  const qtd=Math.floor((peso*1000)/unit);
  if(!Number.isSafeInteger(qtd)||qtd<=0) return out(409,{error:"Quantidade calculada inválida"});
  const freteTotal=Math.round((tarifa*peso+Number.EPSILON)*100)/100;
  if(!Number.isFinite(freteTotal)||!Number.isSafeInteger(Math.round(freteTotal*100))) return out(409,{error:"Valor total do frete inválido"});
  const {data:i,error:ie}=await admin.from("interesses_carga").insert({carga_id:c.id,motorista_id:m.id,veiculo_id:v.id,placa_confirmada:v.placa,status:"selecionado",capacidade_efetiva_t:cap,peso_aceito_t:peso,quantidade_calculada:qtd}).select().single();
  if(ie) return out(409,{error:"Não foi possível aceitar esta carga"});
  const {data:viagem,error:ve}=await admin.from("viagens").insert({carga_id:c.id,motorista_id:m.id,veiculo_id:v.id,placas_snapshot:{principal:v.placa},origem:c.origem_cidade+"/"+c.origem_uf,destino:c.destino_cidade+"/"+c.destino_uf,produto:c.produto,peso_t:peso,frete_por_t:c.frete_por_t,frete_total:freteTotal,status:"aguardando_pedido"}).select().single();
  if(ve){await admin.from("interesses_carga").delete().eq("id",i.id);return out(500,{error:"Falha ao criar viagem"});}
  await admin.from("cargas").update({status:"atribuida"}).eq("id",c.id).eq("status","publicada");
  const payload={carga_id:c.id,carga_forte_numero:c.numero_carga_forte??c.codigo??null,viagem_id:viagem.id,motorista:{id:m.id,nome:m.nome,cpf:m.cpf,whatsapp:m.telefone},veiculo:{id:v.id,placa:v.placa,capacidade_efetiva_t:cap},fornecedor:c.fornecedor,local_expedicao:c.local_expedicao,origem:c.origem_cidade+"/"+c.origem_uf,destino:c.destino_cidade+"/"+c.destino_uf,produto:c.produto,peso_t:peso,peso_unitario_kg:unit,quantidade:qtd,frete_por_t:c.frete_por_t,status_vendas:"MOTORISTA VINCULADO",exigencia:c.numero_pedido_fornecedor?"PEDIDO INFORMADO":"AGUARDANDO PEDIDO DO FORNECEDOR"};
  await admin.from("integracao_forte_vendas").insert({carga_id:c.id,interesse_id:i.id,motorista_id:m.id,veiculo_id:v.id,status:"PENDENTE_ENVIO",payload});
  return out(200,{ok:true,status:"ACEITA_AGUARDANDO_PEDIDO",peso_t:peso,quantidade:qtd,viagem_id:viagem.id});
 }catch(e){return out(500,{error:"Falha ao processar aceite da carga"});}
});
