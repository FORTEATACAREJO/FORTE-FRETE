export const routeKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function findFreightRate(rates,origin,destination,selected){
 const matches=(rates||[]).filter(r=>r.ativa!==false&&(selected?r.id===selected:routeKey(r.origem)===routeKey(origin)&&routeKey(r.destino)===routeKey(destination)));
 return matches.length===1?matches[0]:null;
}
export function resolveFreightRate(value,tariff){
 const blank=value===null||value===undefined||typeof value==='string'&&!value.trim();
 if(!blank&&!['number','string'].includes(typeof value))throw Error('Informe um valor de frete válido.');
 if(blank&&!tariff)throw Error('Informe o valor combinado ou cadastre uma sugestão para esta rota na tabela de frete.');
 const amount=Number(blank?tariff.valor_por_t:value);
 if(!Number.isFinite(amount)||amount<0||amount>9999999999.99)throw Error('Informe um valor de frete válido.');
 return {valor:Math.round((amount+Number.EPSILON)*100)/100,fonte:blank?'TABELA':'COMBINADO',tarifaId:blank?tariff.id:null};
}
export async function renderFreightRates({client,host,rates,escape,format,onSaved}){
 host.innerHTML=`<details><summary>TABELA DE FRETE — SUGESTÕES POR ROTA</summary><p>Referência em R$/tonelada. O combinado pode ser diferente. Alterar a tabela não altera cargas já gravadas.</p><form id="tariffForm"><input id="tariffId" type="hidden"><label>Origem (cidade/UF ou local)<input id="tariffOrigin" required maxlength="150"></label><label>Destino (cidade/UF ou local)<input id="tariffDestination" required maxlength="150"></label><label>Sugestão R$/t<input id="tariffAmount" type="number" min="0" step="0.01" required></label><label><input id="tariffActive" type="checkbox" checked> Ativa</label><button type="submit">SALVAR SUGESTÃO</button><button id="tariffNew" type="button">NOVA ROTA</button><p id="tariffMessage" role="status"></p></form><table><thead><tr><th>Rota</th><th>R$/t</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${rates.map(r=>`<tr><td>${escape(r.origem)} → ${escape(r.destino)}</td><td>${format(r.valor_por_t)}</td><td>${r.ativa?'Ativa':'Inativa'}</td><td><button type="button" data-tariff="${escape(r.id)}">EDITAR</button></td></tr>`).join('')||'<tr><td colspan="4">Nenhum valor de referência cadastrado.</td></tr>'}</tbody></table></details>`;
 const el=id=>host.querySelector('#'+id),form=el('tariffForm');
 host.querySelectorAll('[data-tariff]').forEach(button=>button.onclick=()=>{const r=rates.find(x=>x.id===button.dataset.tariff);el('tariffId').value=r.id;el('tariffOrigin').value=r.origem;el('tariffDestination').value=r.destino;el('tariffAmount').value=r.valor_por_t;el('tariffActive').checked=r.ativa;});
 el('tariffNew').onclick=()=>{form.reset();el('tariffId').value='';};
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;try{const id=el('tariffId').value,row={origem:el('tariffOrigin').value.trim(),destino:el('tariffDestination').value.trim(),valor_por_t:resolveFreightRate(el('tariffAmount').value,null).valor,ativa:el('tariffActive').checked,updated_at:new Date().toISOString()};const result=id?await client.from('frete_tarifas').update(row).eq('id',id):await client.from('frete_tarifas').insert(row);if(result.error)throw result.error;await onSaved();}catch(e){el('tariffMessage').textContent=e.message||'Não foi possível salvar.';button.disabled=false;}};
}
