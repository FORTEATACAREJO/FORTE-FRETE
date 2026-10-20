export function currentFreightReceipt(state,load){
 if(load.modalidadeFrete==='CIF')return null;
 const docs=(state.documentos||[]).filter(d=>d.cargaId===load.id&&d.categoria==='COMPROVANTE FRETE'&&d.validationStatus==='VALIDADO'&&d.validadoFinanceiroPor&&d.storagePath&&/^[a-f0-9]{64}$/.test(d.hash||''));
 if(load.comprovanteFreteDocumentoId){const current=docs.find(d=>d.id===load.comprovanteFreteDocumentoId);if(!current)throw Error('Comprovante atual não validado ou arquivo indisponível.');return current;}
 return docs.slice().sort((a,b)=>String(b.validadoEm||b.receivedAt||'').localeCompare(String(a.validadoEm||a.receivedAt||'')))[0]||null;
}
