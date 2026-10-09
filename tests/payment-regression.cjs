const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf("document.querySelectorAll('.pay').forEach"),end=source.indexOf('\nfunction bindTripReceipts',start);
const handler=source.slice(start,end).trim().slice(0,-1);
async function scenario({receipt=true,result={data:[{id:'trip'}]},notificationError=null}={}){
 const button={dataset:{id:'trip'},disabled:false},alerts=[],events=[];
 const chain={eq(key,value){events.push(['eq',key,value]);return this;},select:async()=>result};
 const context={rows:[{id:'trip',motorista_id:'driver',motoristas:{nome:'Motorista',telefone:'55'},pagamento_comprovante_path:receipt?'driver/proof.pdf':null}],mode:'pagamentos',document:{querySelectorAll:()=>[button]},s:{from:table=>table==='viagens'?{update:values=>{events.push(['update',values]);return chain;}}:{insert:async()=>{events.push(['notification']);return {error:notificationError};}}},alert:message=>alerts.push(message),confirm:()=>true,viagensAdmin:async()=>events.push(['refresh']),vendasOrders:async()=>events.push(['orders']),Date};
 vm.runInNewContext(handler,context);await button.onclick();return {button,alerts,events};
}
test('pagamento sem comprovante não altera viagem nem envia aviso',async()=>{const out=await scenario({receipt:false});assert.equal(out.events.length,0);assert.match(out.alerts[0],/comprovante/);});
test('erro ou conflito de pagamento não produz falso sucesso nem aviso',async()=>{for(const result of [{error:new Error('negado')},{data:[]}]){const out=await scenario({result});assert(!out.events.some(x=>x[0]==='notification'));assert(!out.events.some(x=>x[0]==='refresh'));assert.equal(out.button.disabled,false);assert.match(out.alerts[0],/Não foi possível confirmar/);}});
test('pagamento confirmado usa estado esperado e distingue falha do aviso',async()=>{const out=await scenario({notificationError:new Error('fila indisponível')});assert(out.events.some(x=>x[0]==='eq'&&x[1]==='pagamento_status'&&x[2]==='aguardando_pagamento'));assert.equal(out.events.filter(x=>x[0]==='notification').length,1);assert.match(out.alerts[0],/Pagamento gravado/);assert(out.events.some(x=>x[0]==='refresh'));});
