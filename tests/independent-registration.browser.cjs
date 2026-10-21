const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://fixture').pathname);if(!file.startsWith(root+'/'))return res.writeHead(403).end();try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.end('<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/forte-ui.css"><link rel="stylesheet" href="/mobile-approved.css"><main id="host"></main>');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept('Troca de teste explicitamente solicitada'));
  await page.route('**/legal-acceptance.js',r=>r.fulfill({contentType:'text/javascript',body:'export const confirmLegal=async()=>{};'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  await page.evaluate(async()=>{
   window.calls=[];window.drafts=[];window.vehicles=[];
   window.client={functions:{invoke:async(name,{body:b})=>{calls.push(structuredClone(b));
    if(b.action==='LIST')return{data:{drafts,vehicles,driverId:'driver',profile:{nome:'Motorista fictício',cpf:'52998224725',whatsapp:'11999999999'}}};
    if(b.action==='SAVE'){let d=drafts.find(d=>d.id===b.id);if(!d){d={id:b.id,revision:0,status:'DRAFT'};drafts.push(d);}else{if(d.revision!==b.revision)throw Error('Revisão antiga');d.revision++;}d.data=structuredClone(b.data);return{data:{revision:d.revision}};}
    if(b.action==='UPLOAD')return{data:{path:'own/'+b.id+'/'+b.kind,token:'signed'}};
    if(b.action==='SUBMIT'){const d=drafts.find(d=>d.id===b.id);d.status='SUBMITTED';vehicles.push({id:'vehicle',placa:d.data.plate,tipo:d.data.vehicle_type,capacidade_efetiva_t:d.data.capacity,status_aprovacao:'EM_ANALISE',ativo:true,motorista_id:null});return{data:{status:'SUBMITTED'}};}
    if(b.action==='ADMIN_LIST')return{data:{vehicles,drivers:[{id:'driver',nome:'Motorista fictício',status_cadastro:'aprovado',auth_user_id:'own'}],links:[],requests:[]}};
    if(b.action==='REVIEW'){vehicles[0].status_aprovacao=b.decision;return{data:{status:b.decision}};}
    if(b.action==='LINK'||b.action==='UNLINK'){vehicles[0].motorista_id=b.action==='LINK'?b.driver_id:null;return{data:{status:'OK'}};}
    if(b.action==='LOOKUP')return{data:{vehicle:{id:'vehicle',placa:'ABC1D23',status_aprovacao:'APROVADO'},message:'Placa cadastrada.'}};
    if(b.action==='REQUEST_LINK')return{data:{message:'Solicitação salva. Nenhum vínculo criado.'}};
    throw Error('Ação inesperada '+b.action);
   }},storage:{from:()=>({uploadToSignedUrl:async()=>({})})}};
   window.module=await import('/vehicle-registration.js');window.host=document.querySelector('#host');await module.renderVehicleRegistration({client,host});
  });
  await page.getByRole('button',{name:'NOVO VEÍCULO',exact:true}).click();await page.getByRole('button',{name:'SALVAR RASCUNHO',exact:true}).click();await page.getByRole('status').filter({hasText:'Rascunho salvo'}).waitFor();
  await page.locator('[name=vehicle_type]').selectOption('Carreta');for(const [key,value] of Object.entries({plate:'ABC1D23',brand:'Marca fictícia',model:'Modelo fictício',year:'2020',capacity:'38'}))await page.locator(`[name=${key}]`).fill(value);
  for(const k of ['carreta_1','dolly','carreta_2'])await page.locator(`[data-absent=${k}]`).check();
  for(const k of ['cavalo','rntrc','foto_frente','foto_lateral'])await page.locator(`[data-file=${k}]`).setInputFiles({name:k+(k.startsWith('foto_')?'.png':'.pdf'),mimeType:k.startsWith('foto_')?'image/png':'application/pdf',buffer:Buffer.from('fixture')});
  await page.locator('[name=declaracao]').check();await page.getByRole('button',{name:'ENVIAR SOMENTE O VEÍCULO PARA ANÁLISE',exact:true}).click();await page.getByText('EM_ANALISE',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>vehicles[0].motorista_id),null);assert.equal(await page.evaluate(()=>calls.some(c=>['LINK','REVIEW'].includes(c.action))),false);
  await page.evaluate(()=>module.renderVehicleReviews({client,host}));await page.getByRole('button',{name:'APROVAR SOMENTE VEÍCULO',exact:true}).click();await page.getByText('APROVADO',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>vehicles[0].motorista_id),null);assert.equal(await page.evaluate(()=>calls.some(c=>c.action==='LINK')),false);
  await page.evaluate(()=>module.renderVehicleReviews({client,host,linksOnly:true}));await page.getByRole('combobox',{name:'Motorista aprovado'}).selectOption('driver');await page.getByRole('button',{name:'VINCULAR',exact:true}).click();await page.getByRole('button',{name:'DESVINCULAR',exact:true}).waitFor();assert.equal(await page.evaluate(()=>vehicles[0].motorista_id),'driver');
  await page.getByRole('button',{name:'DESVINCULAR',exact:true}).click();await page.getByRole('button',{name:'VINCULAR',exact:true}).waitFor();assert.equal(await page.evaluate(()=>vehicles[0].motorista_id),null);
  await page.evaluate(()=>module.renderVehicleRegistration({client,host}));await page.getByText('Usar veículo já cadastrado',{exact:true}).click();await page.locator('[data-plate]').fill('ABC1D23');await page.getByRole('button',{name:'BUSCAR PLACA',exact:true}).click();await page.getByRole('button',{name:'SOLICITAR VÍNCULO COM ESTE VEÍCULO',exact:true}).click();await page.getByText('Solicitação salva. Nenhum vínculo criado.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>vehicles[0].motorista_id),null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('PASS separate vehicle form, review, explicit link/unlink and existing-plate request '+width);await page.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
