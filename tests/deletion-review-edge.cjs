const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const origin='https://forte-frete.onrender.com';
async function call({profile,invalidUser=false,body={action:'ASSESS',id:'de1e7100-0000-4000-8000-000000000014'},site=origin}={}){
 let handler;const calls=[];
 const db={auth:{getUser:async()=>({data:{user:invalidUser?null:{id:'actor-from-auth'}},error:invalidUser?{}:null})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:profile||{perfil:'MASTER',ativo:true,status_aprovacao:'APROVADO',trocar_senha:false}})}),rpc:async(name,args)=>{calls.push({name,args});return {data:{read_only:true,deleted:false}}}};
 let code=fs.readFileSync('supabase/functions/account-deletion-review/index.ts','utf8').replace(/^import[^\n]+\n/,'');code=stripTypeScriptTypes(code,{mode:'transform'});
 vm.runInNewContext(code,{createClient:()=>db,Deno:{serve:fn=>handler=fn,env:{get:()=>''}},Response,JSON,atob});
 const jwt='e30.'+Buffer.from(JSON.stringify({session_id:'session-from-token'})).toString('base64url')+'.signature';
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Origin:site,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 return {status:response.status,body:await response.json(),calls};
}
(async()=>{
 let r=await call({invalidUser:true});assert.equal(r.status,401);assert.equal(r.calls.length,0);
 for(const p of [{perfil:'MOTORISTA',ativo:true,status_aprovacao:'APROVADO'},{perfil:'MASTER',ativo:false,status_aprovacao:'APROVADO'},{perfil:'MASTER',ativo:true,status_aprovacao:'PENDENTE'},{perfil:'MASTER',ativo:true,status_aprovacao:'APROVADO',trocar_senha:true}]){r=await call({profile:p});assert.equal(r.status,403);assert.equal(r.calls.length,0)}
 r=await call({site:'https://foreign.example.invalid'});assert.equal(r.status,403);assert.equal(r.calls.length,0);
 r=await call({body:{action:'DELETE',id:'de1e7100-0000-4000-8000-000000000014'}});assert.equal(r.status,400);assert.equal(r.calls.length,0);
 r=await call({body:{action:'ASSESS',id:'de1e7100-0000-4000-8000-000000000014',p_actor:'spoofed',user_id:'other-user'}});assert.equal(r.status,200);assert.equal(r.body.deleted,false);assert.equal(r.calls[0].name,'frete_deletion_assess');assert.equal(r.calls[0].args.p_actor,'actor-from-auth');assert.equal(r.calls[0].args.p_session,'session-from-token');assert.equal('user_id' in r.calls[0].args,false);
 console.log('PASS: sessão e papel validados; origem controlada; identidade derivada do token; ação DELETE recusada; análise sem remoção.');
})().catch(e=>{console.error(e);process.exit(1)});
