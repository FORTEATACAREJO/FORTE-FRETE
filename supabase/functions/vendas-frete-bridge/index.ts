import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const VENDAS_URL='https://gtwecfyffjszghnvtlzr.supabase.co';
const VENDAS_KEY='sb_publishable_RP8g0VoZdWh8e9R7Nb9mYw_GSXjSuD3';
const EMPRESA_FORTE='49832961-0000-4000-8000-000000000001';
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 try {
  if(req.method!=='POST')throw new Error('Método inválido.');
  const auth=req.headers.get('Authorization')||'';
  const vendas=createClient(VENDAS_URL,VENDAS_KEY,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:authError}=await vendas.auth.getUser();if(authError||!user)return Response.json({error:'Sessão do Forte Vendas inválida.'},{status:401,headers});
  const {data:p,error:profileError}=await vendas.from('fc_perfis').select('empresa_id,perfil,permissoes,ativo,status_aprovacao,trocar_senha').eq('user_id',user.id).single();
  if(profileError||p.empresa_id!==EMPRESA_FORTE||!p.ativo||p.status_aprovacao!=='APROVADO'||p.trocar_senha||!['MASTER','ADMINISTRADOR','OPERADOR_GERAL','VENDEDOR_INTERNO'].includes(p.perfil))return Response.json({error:'Acesso à integração não autorizado.'},{status:403,headers});
  if(!['MASTER','ADMINISTRADOR'].includes(p.perfil)&&p.permissoes?.vendas!==true&&p.permissoes?.['carga-direta']!==true&&p.permissoes?.['VENDAS E COMPRAS']?.editar!==true)throw new Error('Sem permissão comercial para a integração.');
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body=await req.json();
  const {data:drivers,error:driversError}=await admin.from('motoristas').select('id,nome,cpf,telefone,rntrc,proprietario_nome,status_cadastro,veiculos_motorista(id,placa,tipo,capacidade_efetiva_t,capacidade_t,ativo,conjunto_principal,componentes,rntrc)').eq('status_cadastro','aprovado');if(driversError)throw driversError;
  if(body.action==='LIST_DRIVERS')return Response.json({motoristas:(drivers||[]).flatMap(m=>m.veiculos_motorista.filter(v=>v.ativo).map(v=>({id:'frete-'+m.id+'-'+v.id,freteMotoristaId:m.id,freteVeiculoId:v.id,nome:m.nome,cpf:m.cpf,telefone:m.telefone,rntrc:v.rntrc||m.rntrc,proprietario:m.proprietario_nome,statusCadastro:'APROVADO',ativo:true,placa1:v.placa,placa2:v.componentes?.[0]?.placa||'',placa3:v.componentes?.[1]?.placa||'',placa4:v.componentes?.[2]?.placa||'',capacidadeMaximaKg:Number(v.capacidade_efetiva_t||v.capacidade_t||0)*1000,capacidadeAlvoKg:Number(v.capacidade_efetiva_t||v.capacidade_t||0)*1000,origemCadastro:'FORTE FRETE'})))},{headers});
  if(body.action!=='PUBLISH')throw new Error('Ação inválida.');
  const {data:row,error:stateError}=await vendas.from('fc_app_state').select('estado').eq('empresa_id',p.empresa_id).single();if(stateError)throw stateError;
  const state=row.estado,c=(state.cargas||[]).find(x=>x.id===body.cargaId&&x.status!=='CANCELADA');
  if(!c?.numeroPedidoFornecedor||!c.ordemRevisadaEm||!c.itens?.length)throw new Error('Revise e grave a ordem no Forte Vendas antes de enviá-la.');
  const m=(state.motoristas||[]).find(x=>x.id===c.motoristaId),driver=drivers.find(x=>x.id===m?.freteMotoristaId);if(!driver)throw new Error('Selecione um motorista aprovado e sincronizado do Forte Frete.');
  const vehicle=driver.veiculos_motorista.find(v=>v.id===m.freteVeiculoId&&v.ativo);if(!vehicle||Number(c.pesoKg)>Number(vehicle.capacidade_efetiva_t||vehicle.capacidade_t||0)*1000)throw new Error('Conjunto inválido ou peso acima da capacidade.');
  const plateList=[vehicle.placa,...(vehicle.componentes||[]).map(v=>v.placa)].filter(Boolean);if(c.placas?.[0]!==vehicle.placa)throw new Error('Conjunto mudou. Sincronize os motoristas e revise a ordem.');
  let paymentPath=null;
  const doc=(state.documentos||[]).find(d=>d.cargaId===c.id&&d.categoria==='COMPROVANTE FRETE'&&d.validationStatus==='VALIDADO'&&d.storagePath);
  if(doc){const {data:blob,error:downloadError}=await vendas.storage.from(doc.storageBucket).download(doc.storagePath);if(downloadError)throw downloadError;paymentPath=p.empresa_id+'/'+c.id+'/'+doc.hash;const {error:uploadError}=await admin.storage.from('vendas-ordens-frete').upload(paymentPath,blob,{upsert:true,contentType:blob.type||'application/pdf'});if(uploadError)throw uploadError;}
  const snapshot={codigo:c.codigo,pedido:c.numeroPedidoFornecedor,fornecedor:c.fornecedor,origem:c.localCarregamento||c.origem,destino:c.destino,dataCarregamento:c.dataCarregamento,motorista:driver.nome,placas:plateList,pesoKg:c.pesoKg,fretePorTon:c.fretePorTon,freteValor:c.freteValor,modalidadeFrete:c.modalidadeFrete,pallet:c.regraPallets||c.pallet,palletQuantidade:c.palletQuantidade,itens:c.itens.map(i=>({produto:i.produto,qtd:i.qtd,pesoKg:i.pesoKg}))};
  const at=new Date().toISOString();const {data:receipt,error}=await admin.from('vendas_ordens').upsert({empresa_vendas_id:p.empresa_id,carga_vendas_id:c.id,motorista_id:driver.id,snapshot,documento_frete_path:paymentPath,pagamento_status:paymentPath?'PAGO — COMPROVANTE VALIDADO':c.modalidadeFrete==='CIF'?'CIF — NÃO SE APLICA':'PENDENTE',updated_at:at},{onConflict:'empresa_vendas_id,carga_vendas_id'}).select('id,enviada_em').single();if(error)throw error;
  return Response.json({ok:true,id:receipt.id,enviadaEm:receipt.enviada_em,motoristaId:driver.id},{headers});
 } catch(e){return Response.json({error:e.message||'Falha na integração.'},{status:400,headers});}
});
