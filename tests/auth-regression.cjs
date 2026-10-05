const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const origin='https://forte-frete.onrender.com';
async function edge(name,body,state={}){
 const writes=[];let handler;const env={SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-secret',SUPABASE_ANON_KEY:'test-public'};
 class Query{
  constructor(table){this.table=table;this.action='select'}
  select(){return this}eq(){return this}limit(){return this}lt(){return this}in(){return this}
  insert(payload){this.action='insert';this.payload=payload;return this}update(payload){this.action='update';this.payload=payload;return this}delete(){this.action='delete';return this}
  single(){return this}maybeSingle(){return this}
  then(resolve,reject){
   if(this.action!=='select')writes.push({table:this.table,action:this.action,payload:this.payload});
   let data=null,error=null;
   if(this.table==='usuarios_app'&&this.action==='select')data=name==='register-driver-invite'?null:state.account||{user_id:'test-user',perfil:'MOTORISTA',ativo:true,status_aprovacao:'APROVADO',email:'driver@example.invalid',whatsapp:'5534999990001'};
   if(name==='login-cpf'&&this.table==='usuarios_app')data=[data];
   if(this.table==='motoristas'&&this.action==='select')data={status_cadastro:'pre_cadastro'};
   if(this.action==='update')data=[{id:'test-record',user_id:'test-user'}];
   if(this.action==='insert'&&this.table==='usuarios_app')data=[{id:'test-record',user_id:'new-user'}];
   if(state.failProfile&&this.table==='usuarios_app'&&this.action==='insert')error={code:'FAIL'};
   return Promise.resolve({data,error}).then(resolve,reject);
  }
 }
 const client={from:table=>new Query(table),auth:{
  getUser:async()=>({data:{user:{id:'test-user'}},error:null}),
  signInWithPassword:async()=>{writes.push({auth:'login'});return {data:{session:{access_token:'test-access',refresh_token:'test-refresh'}},error:null}},
  resetPasswordForEmail:async()=>{writes.push({auth:'email_recovery'});return {error:null}},
  admin:{createUser:async payload=>{writes.push({auth:'create',payload});return {data:{user:{id:'new-user'}},error:null}},deleteUser:async id=>writes.push({auth:'delete',id}),getUserById:async()=>({data:{user:{email:'driver@example.invalid'}},error:null}),updateUserById:async(id,payload)=>{writes.push({auth:'password_update',payload});return {error:null}}}
 }};
 let code=fs.readFileSync('supabase/functions/'+name+'/index.ts','utf8').replace(/^import[^\n]+\n/,'');
 code=stripTypeScriptTypes(code,{mode:'transform'});
 vm.runInNewContext(code,{createClient:()=>client,Deno:{serve:fn=>handler=fn,env:{get:k=>env[k]}},Response,Request,crypto:globalThis.crypto,TextEncoder,Uint8Array,Uint32Array,AbortSignal,console:{error(){}}});
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{origin,authorization:'Bearer test-session','content-type':'application/json'},body:JSON.stringify(body)}));
 return {status:response.status,data:await response.json(),writes};
}
(async()=>{
 const signup={nome:'MOTORISTA TESTE',cpf:'52998224725',whatsapp:'34999990001',email:'driver@example.invalid',data_nascimento:'1980-01-01',password:'123456789'};
 for(const whatsapp of ['00000000000','5500000000000','349999900','553499999000122'])assert.equal((await edge('register-driver-invite',{...signup,whatsapp})).status,400);
 for(const field of ['email','data_nascimento']){const r=await edge('register-driver-invite',{...signup,[field]:''});assert.equal(r.status,400);assert.equal(r.writes.length,0)}
 for(const birth of ['2026-02-30','2999-01-01'])assert.equal((await edge('register-driver-invite',{...signup,data_nascimento:birth})).status,400);
 for(const password of ['12345','abcdef','12345a'])assert.equal((await edge('register-driver-invite',{...signup,password})).status,400);
 const created=await edge('register-driver-invite',{...signup,perfil:'MASTER',ativo:true});assert.equal(created.status,200);
 const profile=created.writes.find(w=>w.table==='usuarios_app'&&w.action==='insert').payload;assert.equal(profile.perfil,'MOTORISTA');assert.equal(profile.ativo,false);assert.equal(profile.status_aprovacao,'PENDENTE');
 assert.equal(created.writes.some(w=>w.table==='convites_motorista'),false);assert.equal(created.writes.find(w=>w.table==='motoristas'&&w.action==='insert').payload.data_nascimento,signup.data_nascimento);
 const cleanup=await edge('register-driver-invite',signup,{failProfile:true});assert.equal(cleanup.status,503);assert.ok(cleanup.writes.some(w=>w.auth==='delete'&&w.id==='new-user'));
 const blocked=await edge('login-cpf',{cpf:signup.cpf,password:signup.password},{account:{user_id:'test-user',ativo:false,status_aprovacao:'REPROVADO',perfil:'MOTORISTA'}});assert.equal(blocked.status,401);assert.ok(!blocked.writes.some(w=>w.auth==='login'));
 const pending={user_id:'test-user',ativo:false,status_aprovacao:'PENDENTE',perfil:'MOTORISTA',email:signup.email,whatsapp:signup.whatsapp};
 assert.equal((await edge('login-cpf',{cpf:signup.cpf,password:signup.password},{account:pending})).status,200);
 const password=await edge('set-password',{password:'123456789'},{account:pending});assert.equal(password.status,200);assert.deepEqual(JSON.parse(JSON.stringify(password.writes.find(w=>w.table==='usuarios_app').payload)),{trocar_senha:false});
 assert.equal((await edge('set-password',{password:'123456789'},{account:{ativo:false,status_aprovacao:'REPROVADO'}})).status,403);
 const mismatch=await edge('recover-password-email',{identificador:signup.cpf,canal:'email',email:'wrong@example.invalid'});assert.equal(mismatch.status,200);assert.ok(!mismatch.writes.some(w=>w.auth==='email_recovery'));
 console.log('PASS: numeric 6+; mandatory email/birth; open registration; pending access only; no privilege injection; registration cleanup; rejection; recovery contact match; password reset preserves approval. No messages sent.');
})().catch(error=>{console.error(error);process.exit(1)});
