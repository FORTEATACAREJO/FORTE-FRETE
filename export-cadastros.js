// Portable cadastros only: no sessions, passwords, login profiles or service credentials.
const tables=['motoristas','veiculos_motorista','favorecidos_frete','chaves_pix_frete','documentos_motorista','documentos_veiculo','rotas','motorista_rotas'];
const serverOnly=new Set(['auth_user_id','analisado_por','criado_por','cadastrado_por']);
async function allRows(client,table){
 const rows=[];
 for(let from=0;;from+=500){
  const order=table==='motorista_rotas'?'motorista_id':'id';
  const result=await client.from(table).select('*').order(order).range(from,from+499);
  if(result.error)throw new Error('Não foi possível exportar '+table+'.');
  rows.push(...result.data);if(result.data.length<500)return rows;
 }
}
export function portableRow(row){return Object.fromEntries(Object.entries(row).filter(([key])=>!serverOnly.has(key)&&key!=='arquivo_path'))}
export async function exportCadastros(client,onProgress=()=>{}){
 const data={formato:'cadastros_transporte',versao:1,exportado_em:new Date().toISOString(),cadastros:{},anexos:[]};
 for(const table of tables){onProgress('Lendo '+table.replaceAll('_',' ')+'…');data.cadastros[table]=await allRows(client,table)}
 for(const table of ['documentos_motorista','documentos_veiculo']){
  for(const doc of data.cadastros[table]){
   onProgress('Incluindo documento '+doc.tipo+'…');
   const result=await client.storage.from('motorista-documentos').download(doc.arquivo_path);
   if(result.error)throw new Error('Não foi possível incluir o documento '+doc.tipo+'. A exportação foi interrompida.');
   const bytes=new Uint8Array(await result.data.arrayBuffer());let binary='';
   for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
   data.anexos.push({documento_id:doc.id,tabela:table,tipo:doc.tipo,nome:doc.arquivo_path.split('/').pop(),mime:result.data.type,base64:btoa(binary)});
  }
 }
 for(const table of tables)data.cadastros[table]=data.cadastros[table].map(portableRow);
 const blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='Cadastros_'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 return {motoristas:data.cadastros.motoristas.length,veiculos:data.cadastros.veiculos_motorista.length,anexos:data.anexos.length};
}
