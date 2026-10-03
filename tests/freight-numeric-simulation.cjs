const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync(process.env.FREIGHT_SIM_SOURCE||'supabase/functions/aceitar-carga/index.ts','utf8');
async function simulate(extra={}){
 let handler;const writes=[];
 const records={motoristas:{id:'M-SIM',nome:'MOTORISTA FICTÍCIO',status_cadastro:'aprovado'},cargas:{id:'C-SIM',peso_min_t:36,peso_max_t:52,peso_unitario_kg:50,frete_por_t:100,origem_cidade:'SIM',destino_cidade:'SIM',...extra.carga},veiculos_motorista:{id:'V-SIM',placa:'SIM',capacidade_efetiva_t:38,...extra.veiculo}};
 const admin={auth:{getUser:async()=>({data:{user:{id:'AUTH-SIM'}}})},from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:records[table]||null}),single:async()=>({data:{id:table+'-SIM'}}),insert(value){writes.push({table,value});return q},update(value){writes.push({table,value});return q},delete(){return q},then(resolve){resolve({data:null,error:null})}};return q;}};
 const context={Response,createClient:()=>admin,Deno:{env:{get:()=> 'FAKE-NO-NETWORK'},serve:f=>handler=f}};
 vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import[^\n]+\n/,''),{mode:'transform'}),context);
 const response=await handler({method:'POST',headers:new Headers({authorization:'Bearer FAKE'}),json:async()=>({carga_id:'C-SIM'})});return {status:response.status,data:await response.json(),writes};
}
(async()=>{const results=[];async function test(name,fn){try{await fn();results.push({name,pass:true})}catch(e){results.push({name,pass:false,error:e.message})}}
 for(const [cap,unit,rate,qtd,total] of [[36,50,100,720,3600],[38,25,120.5,1520,4579],[52,50,99.99,1040,5199.48],[38.5,50,10.01,770,385.39],[38,50,0,760,0]])await test(`${cap}t x R$${rate}/t`,async()=>{const r=await simulate({veiculo:{capacidade_efetiva_t:cap},carga:{peso_unitario_kg:unit,frete_por_t:rate}});assert.equal(r.status,200);assert.equal(r.data.quantidade,qtd);assert.equal(r.writes.find(x=>x.table==='viagens').value.frete_total,total);});
 for(const cap of [35,53,'NaN','Infinity',-1])await test('Bloquear capacidade '+cap,async()=>{const r=await simulate({veiculo:{capacidade_efetiva_t:cap}});assert.equal(r.status,409);assert.equal(r.writes.length,0);});
 for(const unit of [-1,0,'NaN','Infinity'])await test('Bloquear peso unitário '+unit,async()=>{const r=await simulate({carga:{peso_unitario_kg:unit}});assert.equal(r.status,409);assert.equal(r.writes.length,0);});
 for(const rate of [-1,'NaN','Infinity'])await test('Bloquear tarifa '+rate,async()=>{const r=await simulate({carga:{frete_por_t:rate}});assert.equal(r.status,409);assert.equal(r.writes.length,0);});
 for(const carga of [{peso_min_t:60,peso_max_t:52},{peso_min_t:'NaN'},{peso_max_t:'Infinity'}])await test('Bloquear faixa inválida '+JSON.stringify(carga),async()=>{const r=await simulate({carga});assert.equal(r.status,409);assert.equal(r.writes.length,0);});
 const summary={total:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results};if(process.env.FREIGHT_SIM_OUTPUT)fs.writeFileSync(process.env.FREIGHT_SIM_OUTPUT,JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,results:results.filter(x=>!x.pass)},null,2));if(summary.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
