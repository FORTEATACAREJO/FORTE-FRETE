const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://fixture').pathname);if(!file.startsWith(root+'/'))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.end('<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/forte-ui.css"><main id="view"></main>');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  await page.evaluate(async()=>{
   window.calls=[];const drivers=[{id:'partial',nome:'Motorista parcial fictício',cpf:'52998224725',telefone:'11999999999',status_cadastro:'legado',dados_legados:{pendenciasCadastro:['CNH','Conferir placas','E-mail']}},{id:'approved',nome:'Motorista aprovado fictício',auth_user_id:'existing',status_cadastro:'aprovado'}];
   const client={from:table=>({select:()=>{if(table==='documentos_motorista')return Promise.resolve({data:[]});const q={order:async()=>({data:drivers}),eq:(k,id)=>({single:async()=>({data:drivers.find(d=>d.id===id)})})};return q;}}),functions:{invoke:async(name,{body})=>{calls.push(structuredClone(body));if(body.action==='LIST')return{data:{invites:[],can_configure:false}};if(body.action==='CAPABILITIES')return{data:{business_credentials:true,credential_status:'VALID',template_status:'APPROVED'}};if(body.action==='INVITE')return{data:{id:'individual',token:'fixture-secret',recipient_phone:'5511999999999',link:'https://fixture/?codigo=fixture-secret'}};if(body.action==='SEND')return{data:{message:'Meta aceitou o convite para envio. A entrega ainda não foi confirmada.'}};throw Error(body.action);}}};
   const {registrationUI}=await import('/registration.js');await registrationUI({s:client,view:document.getElementById('view'),getSession:()=>({user:{id:'admin'}}),getAdmin:()=>true,onDriver(){}}).drivers();
  });
  assert.equal(await page.getByRole('button',{name:'ENVIAR PARA COMPLETAR',exact:true}).count(),1);
  await page.locator('details summary').first().click();assert.equal(await page.getByText('Registro da CNH',{exact:true}).count(),2);assert.equal(await page.getByText('E-mail',{exact:true}).count(),0);
  await page.getByRole('button',{name:'ENVIAR PARA COMPLETAR',exact:true}).click();
  assert.equal(await page.locator('[name=nome]').inputValue(),'Motorista parcial fictício');assert.equal(await page.locator('[name=whatsapp]').inputValue(),'11999999999');assert.equal(await page.locator('[name=whatsapp]').getAttribute('readonly'),'');
  assert.equal(await page.getByRole('link',{name:'CONVIDAR MOTORISTA PELO WHATSAPP',exact:true}).count(),0);assert.equal(await page.evaluate(()=>calls.some(x=>x.action==='SEND')),false);
  await page.locator('#uiConsent').check();await page.getByRole('button',{name:'ENVIAR CONVITE',exact:true}).click();await page.getByRole('status').filter({hasText:'Meta aceitou'}).waitFor();
  const calls=await page.evaluate(()=>window.calls);assert.equal(calls.filter(x=>x.action==='INVITE').length,1);assert.equal(calls.find(x=>x.action==='INVITE').driver_id,'partial');assert.equal(calls.filter(x=>x.action==='SEND').length,1);assert.equal(calls.find(x=>x.action==='SEND').opt_in,true);assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'VOLTAR',exact:true}).click();await page.getByRole('heading',{name:'Motoristas — pendências de cadastro'}).waitFor();await page.close();console.log('PASS completion invitation from driver list at '+width+'px; simulated messages only');
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
