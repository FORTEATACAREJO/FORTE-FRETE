const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const server=http.createServer((req,res)=>{const p=path.join(root,new URL(req.url,'http://fixture').pathname);if(!p.startsWith(root+'/'))return res.writeHead(403).end();try{res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(p))}catch{res.end('<meta name="viewport" content="width=device-width"><div id="content"></div>')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
try{for(const scenario of ['driver','employee','failed-login','failed-invite']){
 const page=await browser.newPage({viewport:{width:390,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/forte-notifications.js',r=>r.fulfill({contentType:'text/javascript',body:'export const startNotifications=()=>({ready:Promise.resolve(),dispose(){}})'}));
 await page.route('**/integration-vault.js',r=>r.fulfill({contentType:'text/javascript',body:'export const installVaultButton=()=>{};export const renderIntegrationVault=()=>{}'}));
 await page.route('**/user-invites.js',r=>r.fulfill({contentType:'text/javascript',body:'export const renderUserInvites=()=>{};export const inviteCall=async()=>{if(window.scenario==="failed-invite")throw Error("Convite indisponível");return{}}'}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture'+(scenario==='failed-invite'?'?cadastro=convite&convite=1&codigo=fixture':'' ));
 await page.evaluate(async scenario=>{window.scenario=scenario;window.calls=[];window.session=null;window.started=false;window.loginFailure=scenario==='failed-login';window.uploadFailure=true;window.saved={};let authCallback;
 const client={auth:{getSession:async()=>({data:{session:window.session}}),setSession:async()=>{window.session={user:{id:'fixture'}};authCallback?.('SIGNED_IN');return{}},onAuthStateChange:cb=>{authCallback=cb;return{data:{subscription:{unsubscribe(){}}}}}},storage:{from:()=>({uploadToSignedUrl:async(p,t,f)=>{calls.push({action:'BYTES',path:p});if(p.includes('cavalo')&&window.uploadFailure)return{error:Error('Falha simulada no anexo do cavalo')};return{}}})},functions:{invoke:async(name,{body:b})=>{calls.push({...b});if(b.action==='REGISTER')return{data:{message:'Cadastro salvo'}};if(b.action==='LOGIN')return window.loginFailure?{error:{context:new Response(JSON.stringify({error:'Conexão de login indisponível'}),{status:503})}}:{data:{access_token:'fixture',refresh_token:'fixture'}};if(b.action==='STATUS')return{data:{allowed:false,status:'PENDENTE'}};if(b.action==='DRAFT')return{data:{can_start_driver:!window.started,needs_documents:window.started,driver:{nome:'Motorista fictício',cpf:'52998224725'},draft:{updated_at:'fixture',data:window.saved}}};if(b.action==='START_DRIVER'){window.started=true;return{data:{status:'DOCUMENTS_REQUIRED'}}}if(b.action==='SAVE'){window.saved=structuredClone(b.data);return{data:{message:'Rascunho salvo.'}}}if(b.action==='UPLOAD')return{data:{path:'fixture/'+b.kind+'.pdf',token:'fixture'}};throw Error('Unexpected action '+b.action)}}};const {startAccess}=await import('/access-standard.js');window.control=startAccess({client,app:'frete',content:document.getElementById('content')});},scenario);
 if(scenario!=='failed-invite'){await page.getByRole('heading',{name:'Entrada do motorista'}).waitFor();await page.getByRole('button',{name:'CADASTRAR SEM CONVITE',exact:true}).click();}
 await page.getByRole('heading',{name:'Etapa 1 — cadastro do motorista'}).waitFor();if(process.env.FORTE_QA_SCREENSHOTS)await page.screenshot({path:process.env.FORTE_QA_SCREENSHOTS+'/'+scenario+'-entrada.png'});
 if(scenario==='employee')await page.getByRole('button',{name:'SOU FUNCIONÁRIO',exact:true}).click();
 for(const [k,v]of Object.entries({cpf:'52998224725',nome:'Pessoa fictícia',whatsapp:'11999999999',data_nascimento:'2000-01-01',password:'123456',confirm:'123456'}))await page.locator('[name="'+k+'"]').fill(v);
 await page.getByRole('button',{name:scenario==='employee'?'ENVIAR CADASTRO PARA ANÁLISE':'SALVAR E CONTINUAR PARA DOCUMENTOS',exact:true}).click();
 if(scenario==='employee'){await page.getByRole('heading',{name:'Aguardando análise'}).waitFor();assert.equal(await page.locator('input[type=file]').count(),0);assert.equal(await page.locator('[data-nav=driver-documents]').count(),0);assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='START_DRIVER').length),0);}
 else{
  if(scenario==='failed-login'){
   await page.getByRole('heading',{name:'Entrada do motorista'}).waitFor();assert.match(await page.getByRole('status').innerText(),/já foi salvo/);await page.evaluate(()=>window.loginFailure=false);await page.locator('[name=password]').fill('123456');await page.getByRole('button',{name:'ENTRAR',exact:true}).click();await page.getByRole('button',{name:'CONTINUAR CADASTRO DE MOTORISTA'}).click();
  }
  await page.getByRole('heading',{name:'Etapa 2 de 2 — documentos e veículos'}).waitFor();if(process.env.FORTE_QA_SCREENSHOTS){await page.locator('#driver-personal').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.FORTE_QA_SCREENSHOTS+'/'+scenario+'-documentos.png'});}
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='REGISTER').length),1);
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='START_DRIVER').length),1);
  assert(await page.locator('.forte-access').evaluate(e=>e.scrollHeight>e.clientHeight));
  await page.locator('[name=cnh_number]').fill('CNH-FICTICIA');
  await page.locator('[data-file=cnh_frente]').setInputFiles({name:'cnh.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 TEST')});
  await page.locator('[data-file=cavalo]').setInputFiles({name:'cavalo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 TEST')});
  await page.getByRole('button',{name:'SALVAR RASCUNHO',exact:true}).click();await page.getByRole('status').filter({hasText:'Falha simulada'}).waitFor();
  assert.equal(await page.evaluate(()=>saved.cnh_number),'CNH-FICTICIA');assert.equal(await page.evaluate(()=>saved.files.cnh_frente),'fixture/cnh_frente.pdf');
  await page.evaluate(()=>window.uploadFailure=false);await page.getByRole('button',{name:'SALVAR RASCUNHO',exact:true}).click();await page.getByRole('status').filter({hasText:'Rascunho salvo.'}).waitFor();assert.equal(await page.evaluate(()=>saved.files.cavalo),'fixture/cavalo.pdf');
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='BYTES'&&c.path.includes('cnh_frente')).length),1);
  await page.locator('.forte-access').evaluate(e=>{e.scrollTop=e.scrollHeight});
  const b=await page.locator('#doSave').boundingBox();assert(b.y>=0&&b.y<640,'save button accessible at end of form');
  assert(await page.evaluate(()=>document.querySelector('.forte-access').scrollWidth<=innerWidth));
 }
 if(scenario!=='failed-invite')assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='CLAIM').length),0);
 assert.deepEqual(errors,[]);await page.evaluate(()=>control.dispose());await page.close();console.log('PASS: '+scenario+' · lane, transition, recovery and saved attachments');
}}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
