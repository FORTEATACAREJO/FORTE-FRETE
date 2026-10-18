export function driverPDFs(jsPDF,data,c){
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=n=>n?new Date(n).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
function reportPDF(title,sections,{generatedAt=new Date().toISOString()}={}){
 const d=new jsPDF();let y=0;
 function page(){if(y)d.addPage();d.setFillColor(22,42,58);d.rect(0,0,210,34,'F');d.setTextColor(255);d.setFontSize(16);d.text('FORTE ATACAREJO',14,14);d.setFontSize(10);d.text(title,14,23);d.setFillColor(228,111,30);d.rect(0,34,210,2,'F');d.setTextColor(22,42,58);y=45;}
 function line(value,bold=false){d.setFontSize(bold?11:9);d.setFont('helvetica',bold?'bold':'normal');const lines=d.splitTextToSize(String(value??'—'),180);for(const t of lines){if(y>273)page();d.text(t,14,y);y+=5;}y+=2;}
 page();line('Gerado em '+date(generatedAt));
 for(const section of sections){if(y>251)page();d.setFillColor(237,242,246);d.rect(12,y-4,186,8,'F');line(section.title,true);for(const row of section.rows)line(row);y+=4;}
 const total=d.getNumberOfPages();for(let n=1;n<=total;n++){d.setPage(n);d.setFontSize(8);d.setTextColor(85);d.text('Forte Atacarejo • (34) 99920-9335',14,288);d.text(n+' / '+total,190,288,{align:'right'});}
 return d;
}
function purchaseReport(order,driver=false,{payment,allowDriverPayment=false}={}){return reportPDF(driver?'ORDEM DE CARREGAMENTO':'ESPELHO DO PEDIDO AO FORNECEDOR',[
 {title:'Identificação • '+(order.numero||order.codigo),rows:['Referência: '+order.id,'Pedido fornecedor: '+(order.numeroPedidoFornecedor||'Aguardando retorno'),'Fornecedor: '+order.fornecedor,'Unidade compradora: '+order.unidade,'Expedição: '+(order.origem||order.localCarregamento),'Destino: '+order.destino]},
 {title:'Transporte e condições',rows:['Motorista: '+(order.motorista||'A definir'),'Placas: '+(order.placas||[]).join(' / '),'Pagamento: '+(order.pagamento||order.condicaoFornecedor||'—'),'Modalidade: '+order.modalidadeFrete,'Pallets: '+order.regraPallets+' • '+order.palletQuantidade,'Tipo de compra: '+(order.modalidadeCompra||'PADRAO'),...['cpf','cnhNumero','rntrc','proprietario','proprietarioCpf'].filter(k=>order.motoristaSnapshot?.[k]).map(k=>({cpf:'CPF',cnhNumero:'CNH',rntrc:'RNTRC',proprietario:'Proprietário',proprietarioCpf:'CPF/CNPJ proprietário'})[k]+': '+order.motoristaSnapshot[k]),...(order.justificativaPallets?['Ajuste pallets: '+order.justificativaPallets]:[]),...(order.liberacaoPalletsFornecedor?.evidencia?['Autorização do fornecedor: '+order.liberacaoPalletsFornecedor.evidencia]:[])]},
 {title:'Itens do pedido',rows:(order.itens||[]).map(i=>i.produto+' • '+i.qtd+' unidades • '+Number(i.pesoKg/1000).toLocaleString('pt-BR')+' t'+(driver?'':' • Unitário '+money(i.custoUnitario)+' • Total '+money(i.total)))},
 ...(driver&&allowDriverPayment?[{title:'Frete e pagamento autorizado',rows:['Frete por tonelada: '+money(order.fretePorTon),'Total do frete: '+money(order.freteValor),'Favorecido: '+(payment?.favorecido||'Não cadastrado'),...(payment?.documento?['CPF/CNPJ favorecido: '+payment.documento]:[]),'Pix'+(payment?.tipoPix?' ('+payment.tipoPix+')':'')+': '+(payment?.chavePix||'Não cadastrado')]}]:[]),
 {title:'Totais',rows:['Quantidade: '+(order.itens||[]).reduce((a,i)=>a+Number(i.qtd),0),'Peso: '+Number(order.pesoKg/1000).toLocaleString('pt-BR')+' t',...(driver?[]:['Total da compra: '+money((order.itens||[]).reduce((a,i)=>a+Number(i.total),0))])]}
 ]);}
function deliverySections(data,c){
 if(!c.ordemRevisadaEm)throw Error('Revise a ordem antes de gerar o romaneio.');
 const rows=(data.vendas||[]).filter(v=>v.status!=='CANCELADA'&&(c.vendaIds||[]).includes(v.id));
 if(!rows.length)throw Error('Vincule as vendas dos clientes antes de gerar o romaneio.');
 const groups=new Map();
 for(const v of rows){const key=JSON.stringify([v.clienteId,v.destino]);groups.set(key,[...(groups.get(key)||[]),v]);}
 return [{title:'Carregamento '+c.codigo,rows:['Pedido fornecedor: '+c.numeroPedidoFornecedor,'Motorista: '+c.motorista,'Placas: '+(c.placas||[]).join(' / '),'Data do carregamento: '+(c.dataCarregamento||'—'),'Origem: '+(c.localCarregamento||c.origem)]},...[...groups.values()].map((sales,index)=>{const first=sales[0],client=(data.clientes||[]).find(x=>x.id===first.clienteId)||{};return {title:'Entrega '+(index+1)+' • '+first.cliente,rows:['Endereço / obra: '+(first.destino||'CONFERIR ENDEREÇO'),'Contato: '+(client.whatsapp||client.telefone||first.clienteWhatsapp||'—'),...sales.map(v=>'Pedido '+(v.numeroVenda||v.id)+' • '+v.qtd+' '+(v.unidadeMedida||'unidades')+' de '+v.produto+' • '+Number(v.pesoKg||0)/1000+' t'),'Recebido por: __________________________________','Documento: __________________ Data: ____/____/______','Assinatura: ____________________________________','Observações / divergências: _______________________']};})];
}
function deliveryReport(data,c){return reportPDF('ROMANEIO DE ENTREGA POR CLIENTE',deliverySections(data,c));}

return {ordem:purchaseReport(c,true),romaneio:(data.vendas||[]).some(v=>v.status!=='CANCELADA'&&(c.vendaIds||[]).includes(v.id))?deliveryReport(data,c):null};
}
