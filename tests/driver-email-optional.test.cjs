const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild'),{webcrypto}=require('node:crypto');
test('driver registers without personal email and keeps CPF, WhatsApp and pending approval',async()=>{
 let handler;const calls=[];
 const db={from:table=>({select(){return this},eq(){return this},limit:async()=>({data:[]}),insert:async data=>{calls.push({table,data});return{error:null}}}),rpc:async(name,body)=>{calls.push({name,body});return{data:{},error:null}},auth:{admin:{createUser:async data=>{calls.push({created:data});return{data:{user:{id:'fixture-user'}}}},deleteUser:async()=>({})}}};
 const context={module:{exports:{}},exports:{},require:()=>({createClient:()=>db}),Deno:{serve:fn=>handler=fn,env:{get:k=>k==='SUPABASE_URL'?'https://nkynfboqwfxhhxcsrawl.supabase.co':'fixture'}},Response,Request,crypto:webcrypto,TextEncoder};context.exports=context.module.exports;
 vm.runInNewContext(transformSync(fs.readFileSync('supabase/functions/access-standard/index.ts','utf8'),{loader:'ts',format:'cjs'}).code,context);
 const body={action:'REGISTER',app:'frete',registration_kind:'MOTORISTA',nome:'Motorista Fictício',cpf:'52998224725',whatsapp:'11999999999',data_nascimento:'1980-01-01',password:'123456'};
 const call=b=>handler(new Request('https://fixture',{method:'POST',headers:{origin:'https://forte-frete.onrender.com','content-type':'application/json'},body:JSON.stringify(b)}));
 const response=await call(body);assert.equal(response.status,201);assert.equal((await response.json()).status,'PENDENTE');
 const profile=calls.find(x=>x.name==='access_register_profile').body;assert.equal(profile.p_email,null);assert.equal(profile.p_whatsapp,'5511999999999');assert.equal(profile.p_cpf,body.cpf);
 assert(calls.some(x=>x.name==='driver_onboarding_start'));assert.equal(calls.find(x=>x.created).created.email,'cpf.52998224725@acesso.forte.internal');
 assert.equal((await call({...body,email:'invalido'})).status,400);
 assert.equal((await call({...body,whatsapp:''})).status,400);
 assert.equal((await call({...body,registration_kind:'USUARIO'})).status,400);
});
