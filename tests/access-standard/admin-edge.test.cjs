const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { transformSync } = require(process.env.ESBUILD_MODULE || 'esbuild');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../supabase/functions/access-standard/index.ts'), 'utf8');
for (const [app, project, table] of [['frete','nkynfboqwfxhhxcsrawl','usuarios_app'],['fiscal','xmfpvvmvdkepmnvtdoio','profiles'],['vendas','gtwecfyffjszghnvtlzr','fc_perfis']]) {
 test(app + ': approval uses Admin API and active users respect grants and scope', async () => {
  let handler, metadataFailure = false;
  const common = { ativo:true, active:true, status_aprovacao:'APROVADO', empresa_id:'company1', trocar_senha:false };
  const profiles = [
   { ...common, id:'actor', user_id:'actor', nome:'Master', full_name:'Master', perfil:'MASTER', role:'MASTER' },
   { ...common, id:'target', user_id:'target', nome:'Aprovado', full_name:'Aprovado', perfil:'OPERADOR_GERAL', role:'OPERADOR_GERAL' },
   { ...common, id:'pending', user_id:'pending', nome:'Pendente', full_name:'Pendente', perfil:'MOTORISTA', role:'MOTORISTA' },
   { ...common, id:'outside', user_id:'outside', nome:'Outra empresa/unidade', full_name:'Outra empresa/unidade', perfil:'MOTORISTA', role:'MOTORISTA', empresa_id:'company2' }
  ];
  const requests = profiles.map(p => ({id:'req-'+p.user_id,user_id:p.user_id,app,status:p.user_id==='pending'?'PENDENTE':'APROVADO',managed_account:true}));
  const updates=[];
  const data = { [table]:profiles, access_requests:requests, user_establishments:[{user_id:'actor',establishment_id:'unit1'},{user_id:'target',establishment_id:'unit1'},{user_id:'pending',establishment_id:'unit1'},{user_id:'outside',establishment_id:'unit2'}] };
  function from(name) {
   let rows=data[name]||[];
   const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,values){rows=rows.filter(r=>values.includes(r[k]));return q},order(){return q},insert(){return Promise.resolve({error:null})},maybeSingle(){return Promise.resolve({data:rows[0],error:null})},single(){return Promise.resolve({data:rows[0],error:null})},then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject)}};
   return q;
  }
  const createClient=()=>({from,rpc:async(name,b)=>({data:{status:b.p_decision,role:b.p_role,app},error:null}),auth:{getUser:async()=>({data:{user:{id:'actor'}}}),admin:{getUserById:async id=>({data:{user:{id,app_metadata:{existing:'preserved'}}}}),updateUserById:async(id,body)=>{updates.push({id,body});return {error:metadataFailure?{message:'Auth temporarily unavailable'}:null}}}}});
  const context={module:{exports:{}},exports:{},require:()=>({createClient}),Deno:{env:{get:k=>k==='SUPABASE_URL'?`https://${project}.supabase.co`:'fixture'},serve:fn=>handler=fn},crypto:webcrypto,TextEncoder,Response,Request,console};context.exports=context.module.exports;
  vm.runInNewContext(transformSync(source,{loader:'ts',format:'cjs'}).code,context);
  const call=body=>handler(new Request('https://example.invalid',{method:'POST',headers:{origin:`https://forte-${app}.onrender.com`,authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)}));
  let response=await call({action:'REVIEW',id:'req-target',decision:'APROVADO',role:'OPERADOR_GERAL'});
  assert.equal(response.status,200);assert.match((await response.json()).message,/Acesso aprovado e perfil salvo/);
  assert.equal(updates[0].id,'target');assert.equal(updates[0].body.app_metadata.existing,'preserved');assert.equal(updates[0].body.app_metadata.role,'OPERADOR_GERAL');
  metadataFailure=true;response=await call({action:'REVIEW',id:'req-target',decision:'APROVADO',role:'OPERADOR_GERAL'});
  assert.equal(response.status,200);assert.match((await response.json()).message,/sincronização/);
  response=await call({action:'USERS'});assert.equal(response.status,200);
  const users=(await response.json()).users;assert(users.some(u=>u.id==='target'));assert(!users.some(u=>u.id==='pending'));
  if(app!=='frete')assert(!users.some(u=>u.id==='outside'));
  assert(users.every(u=>u.role));assert(users.every(u=>!('permissoes' in u)));
  profiles[0].perfil=profiles[0].role='MOTORISTA';
  assert.equal((await call({action:'USERS'})).status,403);
 });
}
