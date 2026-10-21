const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
export async function loadFreightCatalog(client,fetcher=fetch){
 const {data,error}=await client.auth.getSession();if(error||!data.session)throw Error('Entre novamente para consultar os cadastros.');
 const r=await fetcher('https://gtwecfyffjszghnvtlzr.supabase.co/functions/v1/frete-catalog',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:'sb_publishable_RP8g0VoZdWh8e9R7Nb9mYw_GSXjSuD3','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
 const result=await r.json();if(!r.ok||result.error)throw Error(result.error||'Cadastros indisponíveis.');
 for(const key of ['fornecedores','produtos','locais'])if(!Array.isArray(result[key]))throw Error('Resposta inválida dos cadastros.');return result;
}
let cities;
export async function freightCities(fetcher=fetch){
 if(cities)return cities;
 const response=await fetcher('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Não foi possível consultar as cidades do IBGE.');const rows=await response.json();if(!Array.isArray(rows))throw Error('Consulta de cidades inválida.');
 cities=rows.map(x=>({id:String(x.id),nome:x.nome,uf:x.microrregiao?.mesorregiao?.UF?.sigla||x['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla})).filter(x=>/^\d{7}$/.test(x.id)&&x.nome&&/^[A-Z]{2}$/.test(x.uf));if(!cities.length){cities=null;throw Error('Nenhuma cidade válida recebida do IBGE.');}return cities;
}
export const matchesCatalog=(label,query)=>norm(label).includes(norm(query));
export function requestedCapacity({quantity,unitKg,capacityT}){
 const q=Number(quantity),unit=Number(unitKg),capacity=Number(capacityT);if(!Number.isSafeInteger(q)||q<=0||!Number.isFinite(unit)||unit<=0)throw Error('Confira quantidade e peso da unidade.');
 const requestedT=Math.round(q*unit*1000)/1000000;if(!Number.isFinite(requestedT)||requestedT<=0)throw Error('Peso do pedido inválido.');
 if(capacityT!==undefined&&(!Number.isFinite(capacity)||capacity<=0))throw Error('Conjunto sem capacidade válida.');
 return {requestedT,above:capacity>0&&requestedT>capacity,below:capacity>0&&requestedT<capacity,maxUnits:capacity>0?Math.floor(capacity*1000/unit):null,minimumT:capacity>0?Math.min(requestedT,capacity):requestedT};
}
export function confirmFreightCapacity(host,text){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='freight-capacity-dialog';dialog.innerHTML='<h3>Conferir capacidade</h3><p></p><div><button type="button" data-no>Não</button><button type="button" data-yes>Sim, continuar</button></div>';dialog.querySelector('p').textContent=text;
 let answer=false;dialog.querySelector('[data-no]').onclick=()=>dialog.close();dialog.querySelector('[data-yes]').onclick=()=>{answer=true;dialog.close();};dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);},{once:true});host.append(dialog);dialog.showModal();
});}
