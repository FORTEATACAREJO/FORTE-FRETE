const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function load(fail=false){
 const elements=new Map(),storage=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},insertAdjacentHTML(){},append(){}});return elements.get(id)};
 const client={functions:{invoke:async()=>fail?{error:new Error('failed')}:{data:{access_token:'a',refresh_token:'r'}}},auth:{setSession:async()=>({error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signOut:async()=>({error:null})}};
 const code=fs.readFileSync('app.js','utf8').replace(/^import[^\n]*\n/gm,'');
 await vm.runInNewContext('(async()=>{'+code+'\n})()',{startAccess:()=>({ready:Promise.resolve()}),createClient:()=>client,SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test',registrationUI:()=>({}),exportCadastros(){},document:{addEventListener(){},createElement:()=>({append(){}}),body:{prepend(){}},querySelector:el,getElementById:id=>el('#'+id),querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{search:'',hash:'',replace(){},reload(){}},window:{addEventListener(){}},navigator:{userAgent:'test'},URLSearchParams,Response,setTimeout,console});
 el('#loginId').value='52998224725';el('#loginPass').value='123456789';await el('#btnLogin').onclick();
 return {elements,storage,el};
}
(async()=>{
 const failed=await load(true);assert.equal(failed.storage.has('forteFreteCpf'),false);
 const ok=await load(false);assert.equal(ok.storage.get('forteFreteCpf'),'52998224725');
 ok.el('#btnCadastro').onclick();const html=ok.el('#cadStep').innerHTML;
 assert.match(html,/<input id="cEmail"/);assert.match(html,/<input required id="cNasc"/);assert.ok(html.includes('E-mail (opcional)'));assert.ok(!html.includes('maxlength="6"'));
 console.log('PASS: failed login does not remember CPF; successful login remembers CPF; optional email and required birth in first registration step; no six-digit maximum.');
})().catch(e=>{console.error(e);process.exit(1)});
