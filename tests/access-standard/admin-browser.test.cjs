const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']})});
test.after(async()=>{await browser?.close()});
const root=path.resolve(__dirname,'../../..');
const files={frete:'FORTE-FRETE/access-standard.js',vendas:'FORTE-VENDAS/apps/web/src/access-standard.js',patio:'FORTE-VENDAS/apps/patio/access-standard.js',fiscal:'FORTEFISCAL/src/access-standard.js',financeiro:'FORTE-FINANCEIRO/src/access-standard.js','venda-externa':'FORTE-VENDA-EXTERNA/src/access-standard.js','carga-direta':'FORTE-CARGA-DIRETA/src/access-standard.js',site:'SITE-FORTE-ATACAREJO/access-standard.js'};
for(const [app,file] of Object.entries(files))test(app+': mobile approval gives feedback and active users can be searched',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}}),ui=fs.readFileSync(path.join(root,file),'utf8');
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html lang="pt-BR"><body><header><div data-forte-top-actions></div></header><main id="protected"></main></body></html>'}));
 await page.goto('https://example.invalid/');
 await page.evaluate(async({ui,app})=>{
  window.fixture={pending:[{id:'request1',app,nome:'Usuário de Teste',cpf:'52998224725',created_at:'2026-10-05'}],users:[],calls:[]};
  const client={functions:{invoke:async(name,{body})=>{
   window.fixture.calls.push(body);
   if(body.action==='QUEUE')return {data:{pending:window.fixture.pending,roles:[{value:'OPERADOR_GERAL',label:'Operador geral'}],units:[{establishment_id:'unit1',establishments:{code:'MATRIZ'}}],message:'Fila'}};
   if(body.action==='REVIEW'){window.fixture.pending=[];window.fixture.users=[{id:'target',nome:'Usuário de Teste',cpf:'52998224725',role:body.role}];return {data:{message:'Acesso aprovado e perfil salvo.'}}}
   if(body.action==='USERS')return {data:{users:window.fixture.users}};
   return {data:{allowed:true,isAdmin:true,changing:false}};
  }},auth:{getSession:async()=>({data:{session:{user:{id:'actor'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
  const module=await import('data:text/javascript;base64,'+btoa(unescape(encodeURIComponent(ui))));window.controller=module.startAccess({client,app,content:document.getElementById('protected')});
 },{ui,app});
 await page.getByRole('button',{name:/CADASTROS/}).click();
 const panel=page.locator('.fa-admin-panel');
 await panel.getByRole('button',{name:'APROVAR ACESSO',exact:true}).click();
 await panel.locator('.fa-decision-status').getByText('Selecione o perfil do usuário antes de aprovar.').waitFor();
 assert.equal(await page.evaluate(()=>window.fixture.calls.some(c=>c.action==='REVIEW')),false);
 await panel.locator('.fa-role').selectOption('OPERADOR_GERAL');
 if(app==='fiscal')await panel.locator('.fa-unit').selectOption('unit1');
 await panel.getByRole('button',{name:'APROVAR ACESSO',exact:true}).click();
 await panel.getByText('Acesso aprovado e perfil salvo.',{exact:true}).waitFor();
 assert.equal(await panel.locator('article').count(),0);
 await panel.getByRole('button',{name:'USUÁRIOS ATIVOS',exact:true}).click();
 await panel.getByRole('heading',{name:'Usuários ativos',exact:true}).waitFor();
 await panel.getByText('Operador geral',{exact:true}).waitFor();
 await panel.getByLabel('Buscar por nome, CPF ou perfil').fill('ninguém');
 await panel.getByText('Nenhum usuário encontrado.',{exact:true}).waitFor();
 await panel.getByLabel('Buscar por nome, CPF ou perfil').fill('52998224725');
 assert.equal(await panel.locator('article').count(),1);
 await panel.getByRole('button',{name:'AGUARDANDO ANÁLISE',exact:true}).click();
 await panel.getByRole('heading',{name:'Cadastros aguardando análise',exact:true}).waitFor();
 await page.close();
});
