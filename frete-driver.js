// Driver operation reads only server projections, never supplier dossiers or raw order snapshots.
export async function renderFreteDriver({client,host,screen,driver,onNavigate,escape,format}){
 const request=async(action,id=null)=>{const {data,error}=await client.rpc('frete_operacao',{p_acao:action,p_id:id});if(error)throw new Error('Não foi possível concluir. Atualize e confira sua autorização.');return data;};
 const button=(id,label,action)=>`<button class="btn full" data-action="${action}" data-id="${escape(id)}">${label}</button>`;
 const receipt=(id,path,bucket)=>path?`<button class="btn light proof" data-id="${escape(id)}" data-bucket="${bucket}">VER COMPROVANTE AUTORIZADO</button>`:'';
 try{
 if(screen==='notificacoes'){
  const {data,error}=await client.from('frete_alertas').select('id,evento,mensagem,created_at').order('created_at',{ascending:false}).limit(30);if(error)throw error;
  host.innerHTML='<h2>Avisos da sua operação</h2>'+(data||[]).map(n=>'<article class="card"><p>'+escape(n.mensagem)+'</p><small>'+escape(new Date(n.created_at).toLocaleString('pt-BR'))+'</small></article>').join('');
  if(!data?.length)host.insertAdjacentHTML('beforeend','<article class="card">Nenhum aviso por enquanto.</article>');
 }else if(screen==='cadastro'){
  host.innerHTML=`<h2>Meu perfil</h2><article class="card"><h3>${escape(driver.nome)}</h3><p>Cadastro aprovado</p><p>Para corrigir seus dados, fale com a equipe Forte.</p><button class="btn" data-nav="atendimento">AJUDA</button></article>`;
 }else if(screen==='cargas'){
  const loads=await request('CARGAS');host.innerHTML='<h2>Cargas disponíveis</h2><p>Ofertas compatíveis com seu conjunto. O peso aceito nunca ultrapassa a capacidade cadastrada.</p><div class="grid">'+loads.map(c=>`<article class="card"><span class="badge">${c.privada?'OFERTA PRIVADA PARA VOCÊ':'DISPONÍVEL'}</span><h3>${escape(c.origem)} → ${escape(c.destino)}</h3><p>${escape(c.produto)}<br>${escape(c.peso_min_t)}–${escape(c.peso_max_t)} t • R$ ${format(c.frete_por_t)}/t</p>${button(c.id,'ACEITAR CARGA','ACEITAR')}${c.privada?button(c.id,'RECUSAR OFERTA','RECUSAR'):''}</article>`).join('')+'</div>';
  if(!loads.length)host.insertAdjacentHTML('beforeend','<div class="card">Nenhuma carga permitida disponível agora.</div>');
 }else{
  const trips=await request('VIAGENS');
  if(screen==='home'){
   host.innerHTML='<h2>Olá, '+escape(driver.nome.split(' ')[0])+'</h2><p>Suas cargas e sua viagem em um só lugar.</p><div class="grid"><button class="card" data-nav="cargas">VER CARGAS DISPONÍVEIS</button><button class="card" data-nav="viagens">MINHA VIAGEM</button><button class="card" data-nav="pagamentos">COMPROVANTES DE FRETE</button></div>';
  }else{
   host.innerHTML=`<h2>${screen==='pagamentos'?'Comprovantes de frete':'Minhas viagens'}</h2>`+trips.map(t=>`<article class="card"><h3>${escape(t.origem)} → ${escape(t.destino)}</h3><span class="badge">${escape(t.status)}</span><p>${escape(t.produto)} • ${escape(t.peso_t)} t<br>Frete: R$ ${format(t.frete_total)}<br>Pagamento: ${escape(t.pagamento_status)}</p>${screen==='viagens'&&t.status==='ordem_liberada'?button(t.id,'INICIAR CARREGAMENTO','INICIAR_CARREGAMENTO'):''}${screen==='viagens'&&t.status==='em_carregamento'?button(t.id,'INICIAR VIAGEM','INICIAR_VIAGEM'):''}${screen==='viagens'&&['em_carregamento','em_viagem'].includes(t.status)?button(t.id,'CONFIRMAR ENTREGA','CONCLUIR_VIAGEM'):''}${receipt(t.id,t.pagamento_comprovante_path,'motorista-documentos')}</article>`).join('');
   const orders=await request('ORDENS');host.insertAdjacentHTML('beforeend',orders.map(o=>`<article class="card"><h3>Viagem recebida do Forte Vendas</h3><p>${escape(o.snapshot.origem)} → ${escape(o.snapshot.destino)}<br>Pagamento: ${escape(o.pagamento_status)}</p>${receipt(o.id,o.documento_frete_path,'vendas-ordens-frete')}</article>`).join(''));
   host.querySelectorAll('.proof').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const rows=b.dataset.bucket==='motorista-documentos'?trips:orders;const row=rows.find(x=>x.id===b.dataset.id);const path=row?.pagamento_comprovante_path||row?.documento_frete_path;if(!path)throw new Error('Comprovante indisponível.');const {data,error}=await client.storage.from(b.dataset.bucket).createSignedUrl(path,60);if(error||!data?.signedUrl)throw new Error('Comprovante não autorizado.');window.open(data.signedUrl,'_blank','noopener,noreferrer')}catch(e){alert(e.message)}finally{b.disabled=false}});
   if(!trips.length&&!orders.length)host.insertAdjacentHTML('beforeend','<article class="card">Nenhuma viagem registrada.</article>');
  }
 }
 host.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>onNavigate(b.dataset.nav));
 host.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{if(b.disabled)return;if(!confirm(b.dataset.action==='RECUSAR'?'Recusar a oferta privada? Ela não será publicada automaticamente.':'Confirmar esta operação?'))return;b.disabled=true;try{await request(b.dataset.action,b.dataset.id);onNavigate(b.dataset.action==='ACEITAR'?'viagens':screen)}catch(e){alert(e.message);b.disabled=false}});
 }catch(e){host.innerHTML='<article class="card" role="alert">'+escape(e.message)+'<button class="btn" id="driverRetry">TENTAR NOVAMENTE</button></article>';host.querySelector('#driverRetry').onclick=()=>onNavigate(screen)}
}
