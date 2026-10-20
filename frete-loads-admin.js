import {findFreightRate,resolveFreightRate,renderFreightRates} from './frete-rates.mjs';
export async function renderFreteLoads({client,host,escape,format}){
 const [{data:loads,error},{data:drivers,error:driversError},{data:rates,error:ratesError}]=await Promise.all([
 client.from('cargas').select('*').order('created_at',{ascending:false}).limit(100),
 client.from('motoristas').select('id,nome,veiculos_motorista(placa,ativo)').eq('status_cadastro','aprovado').order('nome'),client.from('frete_tarifas').select('*').order('origem')]);
 if(error||driversError||ratesError){host.innerHTML='<article class="card" role="alert">Não foi possível carregar cargas e motoristas. Atualize e confira sua autorização.</article>';return;}
 const distinct=(values)=>[...new Set(values.filter(Boolean).map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const suggestions={
 fornecedor:distinct(loads.map(c=>c.fornecedor)),
 expedicao:distinct(loads.map(c=>c.local_expedicao)),
 origem:distinct([...loads.map(c=>c.origem_cidade),...rates.map(r=>r.origem?.split('/')?.[0])]),
 destino:distinct([...loads.map(c=>c.destino_cidade),...rates.map(r=>r.destino?.split('/')?.[0])]),
 produto:distinct(loads.map(c=>c.produto)),
 origemUf:distinct(loads.map(c=>c.origem_uf)),
 destinoUf:distinct(loads.map(c=>c.destino_uf))
 };
 const suggestionLists=Object.entries(suggestions).map(([id,items])=>'<datalist id="suggest-'+id+'">'+items.map(v=>'<option value="'+escape(v)+'"></option>').join('')+'</datalist>').join('');
 const field=(id,label,type='text',extra='')=>`<label>${label}<input id="${id}" type="${type}" ${suggestions[id] ? `list="suggest-${id}"` : ""} required ${extra}></label>`;
 host.innerHTML=`<style>
 #loadForm{display:flex;flex-direction:column;gap:12px;min-width:0}
 #loadForm label{display:flex;flex-direction:column;gap:5px;min-width:0}
 #loadForm input,#loadForm select{box-sizing:border-box;width:100%;max-width:100%;min-height:44px}
 #loadForm .formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px;min-width:0;border:0;padding:0;margin:0}
 #loadForm button{max-width:100%;white-space:normal;min-height:42px}
 #loadForm [hidden]{display:none!important}
 #loadForm #saveFreight{align-self:flex-start}
 #loadForm #rateHint{margin:0}
 </style><h2>Cargas e fretes</h2><section id="freightRates"></section><form id="loadForm" class="card">${suggestionLists}<h3>Publicar ou enviar em privado</h3><label>Carga<select id="existingLoad"><option value="">Nova carga</option>${loads.filter(c=>['rascunho','publicada'].includes(c.status)).map(c=>`<option value="${escape(c.id)}">${escape(c.origem_cidade)} → ${escape(c.destino_cidade)} • ${escape(c.oferta_status||c.status)}</option>`).join('')}</select></label><fieldset id="newFields" class="formgrid">${field('fornecedor','Fornecedor')}${field('expedicao','Local de expedição')}${field('origem','Origem — cidade')}${field('origemUf','Origem — UF','text','maxlength="2" pattern="[A-Za-z]{2}"')}${field('destino','Destino — cidade')}${field('destinoUf','Destino — UF','text','maxlength="2" pattern="[A-Za-z]{2}"')}${field('produto','Produto')}${field('unit','Peso da unidade (kg)','number','min="0.001" step="0.001" value="50"')}${field('min','Peso mínimo (t)','number','min="0.001" step="0.001" value="36"')}${field('max','Peso máximo (t)','number','min="0.001" step="0.001" value="52"')}</fieldset><label>Valor combinado do frete (R$/t) — editável<input id="rate" type="number" min="0" step="0.01" placeholder="Em branco: usar tabela da rota"></label><p id="rateHint" role="status"></p><button id="saveFreight" type="button" hidden>SALVAR VALOR DO FRETE</button><label>Disponibilidade<select id="audience"><option value="publica">Publicar para motoristas elegíveis</option><option value="privada">Enviar somente a um motorista</option></select></label><div id="recipientFields" hidden><label>Buscar nome ou placa<input id="driverSearch" type="search"></label><label>Motorista aprovado<select id="recipient"><option value="">Selecione o motorista</option></select></label><p>Apenas o destinatário verá a oferta. Uma recusa não a tornará pública.</p></div><button class="btn green" id="offerSubmit" type="submit">PUBLICAR CARGA</button><p id="offerMessage" role="status" aria-live="polite"></p></form><div class="card tablewrap"><table><thead><tr><th>Rota</th><th>Disponibilidade</th><th>Destinatário</th><th>Situação</th><th>Frete/t</th></tr></thead><tbody>${loads.map(c=>`<tr><td>${escape(c.origem_cidade)} → ${escape(c.destino_cidade)}</td><td>${c.audiencia==='privada'?'PRIVADA':'PÚBLICA'}</td><td>${escape(drivers.find(d=>d.id===c.destinatario_motorista_id)?.nome||'—')}</td><td>${escape(c.status)} • ${escape(c.oferta_status||'pendente')}</td><td>R$ ${format(c.frete_por_t)}</td></tr>`).join('')}</tbody></table></div>`;
 const el=id=>host.querySelector('#'+id),value=id=>el(id).value.trim();let draftId=null;
 const options=()=>{const query=value('driverSearch').toLocaleLowerCase('pt-BR');el('recipient').innerHTML='<option value="">Selecione o motorista</option>'+drivers.filter(d=>(d.nome+' '+(d.veiculos_motorista||[]).filter(v=>v.ativo).map(v=>v.placa).join(' ')).toLocaleLowerCase('pt-BR').includes(query)).map(d=>`<option value="${escape(d.id)}">${escape(d.nome)} • ${escape((d.veiculos_motorista||[]).filter(v=>v.ativo).map(v=>v.placa).join(' / '))}</option>`).join('');};options();el('driverSearch').oninput=options;
 el('audience').onchange=()=>{const privateMode=value('audience')==='privada';el('recipientFields').hidden=!privateMode;el('recipient').required=privateMode;el('offerSubmit').textContent=privateMode?'ENVIAR SOMENTE AO MOTORISTA':'PUBLICAR CARGA';};
 const chosen=()=>loads.find(c=>c.id===value('existingLoad'));
 const autofill=(source,target)=>{if(!value(target))el(target).value=source;};
 el('origem').addEventListener('change',()=>{const match=loads.find(c=>c.origem_cidade?.toLowerCase()===value('origem').toLowerCase());if(match)autofill(match.origem_uf,'origemUf');});
 el('destino').addEventListener('change',()=>{const match=loads.find(c=>c.destino_cidade?.toLowerCase()===value('destino').toLowerCase());if(match)autofill(match.destino_uf,'destinoUf');});
 el('fornecedor').addEventListener('change',()=>{const match=loads.find(c=>c.fornecedor?.toLowerCase()===value('fornecedor').toLowerCase());if(match)autofill(match.local_expedicao,'expedicao');});
 const tariff=()=>{const c=chosen();return findFreightRate(rates,c?c.origem_cidade+'/'+c.origem_uf:value('origem')+'/'+value('origemUf'),c?c.destino_cidade+'/'+c.destino_uf:value('destino')+'/'+value('destinoUf'));};
 const rateHint=()=>{const r=tariff();el('rateHint').textContent=r?'Sugestão da tabela: R$ '+format(r.valor_por_t)+'/t. O valor combinado preenchido tem prioridade.':'Sem sugestão para esta rota. Informe o valor combinado; zero deve ser informado explicitamente.';};
 for(const id of ['origem','origemUf','destino','destinoUf','rate'])el(id).addEventListener('input',rateHint);
 el('existingLoad').onchange=()=>{const c=chosen();el('newFields').disabled=!!c;el('rate').value=c?c.frete_por_t:'';el('saveFreight').hidden=!c;draftId=null;rateHint();};
 const saveRate=async id=>{const r=resolveFreightRate(value('rate'),tariff());const {error}=await client.rpc('frete_alterar_valor',{p_carga:id,p_valor:r.valor,p_fonte:r.fonte,p_tarifa:r.tarifaId});if(error)throw error;return r;};
 el('saveFreight').onclick=async()=>{const button=el('saveFreight');if(button.disabled)return;button.disabled=true;try{await saveRate(value('existingLoad'));await renderFreteLoads({client,host,escape,format});host.querySelector('#offerMessage').textContent='Valor do frete salvo. A tabela permanece apenas como referência.';}catch(e){el('offerMessage').textContent=e.message;button.disabled=false;}};
 await renderFreightRates({client,host:el('freightRates'),rates,escape,format,onSaved:()=>renderFreteLoads({client,host,escape,format})});rateHint();
 el('loadForm').onsubmit=async event=>{event.preventDefault();const button=el('offerSubmit');if(button.disabled)return;const mode=value('audience');if(!confirm(mode==='privada'?'Enviar esta carga somente ao motorista selecionado?':'Publicar esta carga para todos os motoristas elegíveis?'))return;button.disabled=true;el('offerMessage').textContent='Salvando…';try{
 let id=value('existingLoad')||draftId;
 if(!id){const rate=resolveFreightRate(value('rate'),tariff());const minimum=Number(value('min')),maximum=Number(value('max'));if(maximum<minimum)throw new Error('O peso máximo deve ser maior ou igual ao mínimo.');const {data,error}=await client.from('cargas').insert({fornecedor:value('fornecedor'),local_expedicao:value('expedicao'),origem_cidade:value('origem'),origem_uf:value('origemUf').toUpperCase(),destino_cidade:value('destino'),destino_uf:value('destinoUf').toUpperCase(),produto:value('produto'),peso_unitario_kg:Number(value('unit')),frete_por_t:rate.valor,frete_fonte:rate.fonte,frete_tarifa_id:rate.tarifaId,peso_t:minimum,peso_min_t:minimum,peso_max_t:maximum,status:'rascunho'}).select('id').single();if(error)throw error;id=data.id;draftId=id;}else await saveRate(id);
 const {error}=await client.rpc('frete_ofertar',{p_carga_id:id,p_motorista_id:mode==='privada'?value('recipient'):null,p_modo:mode});if(error)throw error;
 await renderFreteLoads({client,host,escape,format});host.querySelector('#offerMessage').textContent=mode==='privada'?'Carga enviada em privado.':'Carga publicada para os motoristas elegíveis.';
 }catch(e){el('offerMessage').textContent=(draftId?'Rascunho preservado, sem publicação. ':'')+(e.message||'Não foi possível enviar a oferta.');button.disabled=false;}};
}
