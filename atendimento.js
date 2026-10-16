const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderAtendimento(client,view,{admin=false}={}){
 view.innerHTML='<div class="card"><h2>Ajuda e privacidade</h2><p><a href="/privacidade.html" target="_blank" rel="noopener">Política de privacidade</a> · <a href="/suporte.html" target="_blank" rel="noopener">Suporte</a> · <a href="/excluir-conta.html" target="_blank" rel="noopener">Solicitar exclusão de conta</a></p><p id="ticketState" role="status">Carregando solicitações...</p><div id="ticketList"></div></div>';
 const state=view.querySelector('#ticketState'),list=view.querySelector('#ticketList');
 const result=await client.from('frete_atendimento').select('id,user_id,tipo,mensagem,status,resposta,created_at').order('created_at',{ascending:false}).limit(100);
 if(result.error){state.textContent='Não foi possível consultar as solicitações. Tente novamente.';return}
 state.textContent=admin?'Atendimento da Forte Frete. Solicitação registrada não significa dados excluídos.':'Suas solicitações e respostas.';
 for(const ticket of result.data||[]){
  const card=document.createElement('article');card.className='card';
  card.innerHTML=`<h3>${esc(ticket.tipo==='EXCLUSAO'?'Exclusão de conta':'Suporte')} — ${esc(ticket.status)}</h3><p>Protocolo ${esc(ticket.id)}<br>${esc(new Date(ticket.created_at).toLocaleString('pt-BR'))}</p><p style="white-space:pre-wrap">${esc(ticket.mensagem)}</p><p style="white-space:pre-wrap">${esc(ticket.resposta||'Aguardando atendimento.')}</p>`;
  if(admin&&ticket.tipo==='EXCLUSAO'){
   const analyze=document.createElement('button'),report=document.createElement('pre');analyze.type='button';analyze.className='btn light';analyze.textContent='ANALISAR VÍNCULOS ANTES DA EXCLUSÃO';report.style.whiteSpace='pre-wrap';report.setAttribute('role','status');
   analyze.onclick=async()=>{analyze.disabled=true;report.textContent='Conferindo vínculos da conta...';try{const r=await client.functions.invoke('account-deletion-review',{body:{action:'ASSESS',id:ticket.id}});if(r.error||!r.data?.read_only)throw Error();const p=r.data;report.textContent=[p.resultado,'Motoristas vinculados: '+p.motoristas_vinculados,'Vínculos para revisão: '+p.revisoes_obrigatorias,...[...(p.vinculos_conta||[]),...(p.vinculos_motorista||[])].map(x=>x.tabela+' / '+x.campo+': '+x.quantidade+' — '+x.categoria),...(p.arquivos_identificados||[]).map(x=>'Arquivos em '+x.bucket+': '+x.quantidade),p.aviso].join('\n');}catch{report.textContent='Não foi possível analisar. Confira sua sessão e tente novamente.';}finally{analyze.disabled=false}};
   card.append(analyze,report);
  }
  if(admin){
   const form=document.createElement('form');form.innerHTML='<label>Situação<select name="status"><option>ABERTO</option><option>EM_ANALISE</option><option>RESPONDIDO</option></select></label><label>Resposta ao titular<textarea name="resposta" maxlength="4000" required></textarea></label><p>Para exclusão, informe andamento e resultado real. Responder não remove a conta nem os arquivos.</p><button class="btn" type="submit">SALVAR RESPOSTA</button><p role="status"></p>';
   form.elements.status.value=ticket.status;form.elements.resposta.value=ticket.resposta;
   form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button'),notice=form.querySelector('[role=status]');button.disabled=true;try{const saved=await client.from('frete_atendimento').update({status:form.elements.status.value,resposta:form.elements.resposta.value.trim()}).eq('id',ticket.id).select('id');if(saved.error||saved.data?.length!==1)throw Error();notice.textContent='Resposta salva.';}catch{notice.textContent='Não foi possível salvar. Confira sua permissão e tente novamente.';}finally{button.disabled=false}};
   card.append(form);
  }
  list.append(card);
 }
 if(!result.data?.length)list.textContent='Nenhuma solicitação registrada.';
}
