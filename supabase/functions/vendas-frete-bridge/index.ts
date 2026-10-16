import {directoryRows,DRIVER_FIELDS} from './directory.mjs';
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
  const permission=await vendas.rpc('fc_operacao_autorizada');if(permission.error||permission.data!==true)return Response.json({error:'Aplicativo sem aprovação operacional.'},{status:403,headers});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body=await req.json();
  if(body.action==='LIST_ACCEPTANCES'){
   const {data:events,error}=await admin.rpc('frete_listar_integracoes');if(error)throw error;
   return Response.json({events:events||[]},{headers});
  }
  if(body.action==='CONFIRM_ACCEPTANCE'){
   // Read the independently stored Vendas receipt. Never trust an order number supplied by the browser.
   const {data:r,error}=await vendas.from('fc_frete_solicitacoes').select('id,frete_evento_id,carga_vendas_id,numero_pedido_fornecedor,status').eq('empresa_id',p.empresa_id).eq('frete_evento_id',body.eventId).single();if(error||!r)throw new Error('Solicitação do Vendas não confirmada.');
   const {data:result,error:confirmError}=await admin.rpc('frete_confirmar_integracao',{p_evento:r.frete_evento_id,p_solicitacao:r.id,p_carga_vendas:r.carga_vendas_id,p_numero_pedido:r.status==='PEDIDO_VINCULADO'?r.numero_pedido_fornecedor:null});if(confirmError)throw confirmError;
   return Response.json(result,{headers});
  }
  const {data:drivers,error:driversError}=await admin.from('motoristas').select(DRIVER_FIELDS.replace('componentes,rntrc,proprietario_nome)', 'componentes,rntrc,proprietario_nome,proprietario_cpf_cnpj,favorecido_id)')+',proprietario_cpf_cnpj,documentos_motorista(id,tipo,status)').in('status_cadastro',['aprovado','legado']);if(driversError)throw driversError;
  if(body.action==='LIST_DRIVERS')return Response.json({motoristas:directoryRows(drivers||[])},{headers});
  if(!['PUBLISH','DRIVER_DETAILS'].includes(body.action))throw new Error('Ação inválida.');
  const {data:row,error:stateError}=await vendas.rpc('fc_carregar_estado');if(stateError)throw stateError;
  const state=row.estado,c=(state.cargas||[]).find(x=>x.id===body.cargaId&&x.status!=='CANCELADA');
  if(!c?.numeroPedidoFornecedor||!c.ordemRevisadaEm||!c.itens?.length)throw new Error('Revise e grave a ordem no Forte Vendas antes de enviá-la.');
  const m=(state.motoristas||[]).find(x=>x.id===c.motoristaId),driver=drivers.find(x=>x.id===m?.freteMotoristaId);if(!driver||driver.status_cadastro!=='aprovado')throw new Error('Selecione um motorista aprovado e sincronizado do Forte Frete.');
  const vehicle=driver.veiculos_motorista.find(v=>v.id===m.freteVeiculoId&&v.ativo);if(!vehicle||Number(c.pesoKg)>Number(vehicle.capacidade_efetiva_t||vehicle.capacidade_t||0)*1000)throw new Error('Conjunto inválido ou peso acima da capacidade.');
  if(body.action==='DRIVER_DETAILS'){
   if(!['MASTER','ADMINISTRADOR'].includes(p.perfil)&&p.permissoes?.verDadosPagamentoMotorista!==true)return Response.json({error:'Sem permissão para dados de pagamento do motorista.'},{status:403,headers});
   let payment=null;
   if(vehicle.favorecido_id){
    const {data:payee,error}=await admin.from('favorecidos_frete').select('id,nome,cpf_cnpj,ativo').eq('id',vehicle.favorecido_id).single();if(error||!payee?.ativo)throw new Error('Favorecido do conjunto não disponível ou inativo.');
    const {data:keys,error:keyError}=await admin.from('chaves_pix_frete').select('tipo,chave,principal').eq('favorecido_id',payee.id).eq('ativo',true).order('principal',{ascending:false});if(keyError)throw keyError;const chosen=(keys||[]).find(k=>k.principal)||(keys?.length===1?keys[0]:null);
    payment={favorecido:payee.nome,documento:payee.cpf_cnpj,chavePix:chosen?.chave||'',tipoPix:chosen?.tipo||''};
   }else{const {data:legacy,error}=await admin.from('motoristas').select('chave_pix,titular_pix').eq('id',driver.id).single();if(error)throw error;payment={favorecido:legacy.titular_pix||driver.nome,chavePix:legacy.chave_pix||''};}
   return Response.json({payment},{headers});
  }
  if(String(c.regraPallets||'').startsWith('Solicitar')&&!c.liberacaoPalletsFornecedor?.evidencia)throw new Error('Registre a autorização de pallets do fornecedor antes de enviar a ordem.');
  const plateList=[vehicle.placa,...(vehicle.componentes||[]).map(v=>v.placa)].filter(Boolean);if(c.placas?.[0]!==vehicle.placa)throw new Error('Conjunto mudou. Sincronize os motoristas e revise a ordem.');
  let paymentPath=null;
  const doc=c.modalidadeFrete==='CIF'?null:(state.documentos||[]).find(d=>d.cargaId===c.id&&d.categoria==='COMPROVANTE FRETE'&&d.validationStatus==='VALIDADO'&&d.validadoFinanceiroPor&&d.storagePath);
  if(doc){const {data:blob,error:downloadError}=await vendas.storage.from(doc.storageBucket).download(doc.storagePath);if(downloadError)throw downloadError;paymentPath=p.empresa_id+'/'+c.id+'/'+doc.hash;const {error:uploadError}=await admin.storage.from('vendas-ordens-frete').upload(paymentPath,blob,{upsert:true,contentType:blob.type||'application/pdf'});if(uploadError)throw uploadError;}
  const snapshot={codigo:c.codigo,pedido:c.numeroPedidoFornecedor,fornecedor:c.fornecedor,origem:c.localCarregamento||c.origem,destino:c.destino,dataCarregamento:c.dataCarregamento,motorista:driver.nome,placas:plateList,pesoKg:c.pesoKg,fretePorTon:c.fretePorTon,freteValor:c.freteValor,modalidadeFrete:c.modalidadeFrete,pallet:c.regraPallets||c.pallet,palletQuantidade:c.palletQuantidade,itens:c.itens.map(i=>({produto:i.produto,qtd:i.qtd,pesoKg:i.pesoKg}))};
  const at=new Date().toISOString();const {data:receipt,error}=await admin.from('vendas_ordens').upsert({empresa_vendas_id:p.empresa_id,carga_vendas_id:c.id,motorista_id:driver.id,snapshot,documento_frete_path:paymentPath,pagamento_status:paymentPath?'PAGO — COMPROVANTE VALIDADO':c.modalidadeFrete==='CIF'?'CIF — NÃO SE APLICA':'PENDENTE',updated_at:at},{onConflict:'empresa_vendas_id,carga_vendas_id'}).select('id,enviada_em').single();if(error)throw error;
  const paymentSync=await admin.rpc('frete_sincronizar_comprovante',{p_carga_vendas:c.id});if(paymentSync.error)throw paymentSync.error;
  return Response.json({ok:true,id:receipt.id,enviadaEm:receipt.enviada_em,motoristaId:driver.id},{headers});
 } catch(e){return Response.json({error:e.message||'Falha na integração.'},{status:400,headers});}
});
