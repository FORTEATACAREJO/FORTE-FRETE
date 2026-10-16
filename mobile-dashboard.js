export async function renderMobileDashboard({client,host,navigate,escape}){
 const results=await Promise.all([
 client.from('motoristas').select('id',{head:true,count:'exact'}).eq('status_cadastro','em_analise'),
 client.from('cargas').select('id',{head:true,count:'exact'}).eq('status','publicada').eq('oferta_status','pendente'),
 client.from('viagens').select('id',{head:true,count:'exact'}).in('status',['em_carregamento','em_viagem']),
 client.from('viagens').select('id',{head:true,count:'exact'}).eq('pagamento_status','aguardando_pagamento')]);
 const metrics=[['Cargas disponíveis',results[1],'cargas'],['Motoristas pendentes',results[0],'pendentes'],['Viagens em andamento',results[2],'viagens'],['Fretes com pendências',results[3],'pagamentos']];
 host.innerHTML='<div class="mobile-welcome"><span class="mobile-eyebrow">Gestão da operação</span><h2>Bom dia, equipe Forte.</h2><p>O que precisa da sua atenção hoje.</p></div><section class="primary-operation"><small>Operação do dia</small><h3>Uma nova carga?<br>Escolha como oferecer.</h3><button class="btn" data-nav="cargas">+ NOVA CARGA</button></section><div class="metric-grid">'+metrics.map(([title,result,screen])=>`<button class="metric" data-nav="${screen}"><small>${title}</small><b>${result.error?'—':escape(result.count??0)}</b><span>${result.error?'Atualizar consulta':'Conferir →'}</span></button>`).join('')+'</div><h3>Próximas ações</h3><article class="card"><h3>Convites e aprovação</h3><p>Confira os motoristas e libere somente os cadastros completos.</p><button class="btn light full" data-nav="convidar">CONVIDAR MOTORISTA</button></article><article class="card"><h3>Pedidos e comprovantes</h3><p>Acompanhe o retorno do pedido pelo Forte Vendas e os comprovantes de frete autorizados.</p><button class="btn light full" data-nav="viagens">ACOMPANHAR VIAGENS</button></article>';
 host.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
}
