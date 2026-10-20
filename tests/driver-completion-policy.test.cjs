const {test}=require('node:test'),assert=require('node:assert/strict'),{buildSync}=require('esbuild'),vm=require('node:vm');
const context={module:{exports:{}},exports:{}};context.exports=context.module.exports;vm.runInNewContext(buildSync({entryPoints:['driver-completion.js'],bundle:true,format:'cjs',write:false}).outputFiles[0].text,context);
const {completionInviteProblem,completionIssues,fillCompletionForm}=context.module.exports;
test('completion invitations require a valid document, contact and unlinked pending driver',()=>{
 const m={cpf:'529.982.247-25',telefone:'(11) 99999-9999',status_cadastro:'legado'};assert.equal(completionInviteProblem(m),'');
 for(const patch of [{cpf:null},{cpf:'11111111111'},{telefone:'99999-9999'},{auth_user_id:'existing'},{status_cadastro:'aprovado'}])assert(completionInviteProblem({...m,...patch}));
 assert.equal(completionIssues({status_cadastro:'aprovado',dados_legados:{pendenciasCadastro:['CPF']}}).length,0);
 assert.equal(completionIssues({dados_legados:{pendenciasCadastro:['E-mail','WhatsApp do proprietário','Conferir placas']}}).join(','),'Conferir placas');
});
test('imported draft fills empty fields and component plates without replacing user edits or accepting files and declarations',()=>{
 const form={elements:Object.fromEntries(Object.entries({cidade:'Editada',cnh_number:'',pix_key:'','plate_carreta_1':'','declaracao':'',password:'',cpf:''}).map(([k,value])=>[k,{value}]))};
 fillCompletionForm(form,{cidade:'Antiga',cnh_number:'12345678901',pix_key:'fixture@example.invalid',plates:{carreta_1:'TES1T23'},declaracao:true,password:'injected',cpf:'11111111111',files:{cnh_frente:'foreign'}});
 assert.equal(form.elements.cidade.value,'Editada');assert.equal(form.elements.cnh_number.value,'12345678901');assert.equal(form.elements.pix_key.value,'fixture@example.invalid');assert.equal(form.elements.plate_carreta_1.value,'TES1T23');for(const k of ['declaracao','password','cpf'])assert.equal(form.elements[k].value,'');
});
test('edge derives the inviting administrator from the session and refuses driver referral targets',async()=>{
 for(const role of ['MASTER','MOTORISTA']){
  let handler;const calls=[];const db={auth:{getUser:async()=>({data:{user:{id:'session-actor'}}})},from:t=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:role==='MASTER'?{perfil:role,ativo:true,status_aprovacao:'APROVADO'}:{perfil:role,ativo:true,status_aprovacao:'APROVADO'}}),maybeSingle:async()=>({data:{status_cadastro:'aprovado'}})};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='forte_legal_status'?{accepted:true}:{id:'invite',token:'secret-token'}}}};
  const ctx={module:{exports:{}},exports:{},require:()=>({createClient:()=>db}),Deno:{serve:fn=>handler=fn,env:{get:()=> 'https://nkynfboqwfxhhxcsrawl.supabase.co'}},URL,Request,Response};ctx.exports=ctx.module.exports;
  const {transformSync}=require('esbuild');vm.runInNewContext(transformSync(require('node:fs').readFileSync('supabase/functions/access-invites/index.ts','utf8'),{loader:'ts',format:'cjs'}).code,ctx);
  const response=await handler(new Request('https://fixture',{method:'POST',headers:{origin:'https://forte-frete.onrender.com',authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify({app:'frete',action:'INVITE',driver_id:'target',whatsapp:'11999999999',actor:'forged'})}));
  assert.equal(response.status,role==='MASTER'?200:403);const call=calls.find(x=>x.name==='driver_completion_invite_create');if(role==='MASTER'){assert.equal(call.args.p_actor,'session-actor');assert.equal(call.args.p_driver,'target');assert.equal(call.args.p_phone,'5511999999999');}else assert.equal(call,undefined);
 }
});
