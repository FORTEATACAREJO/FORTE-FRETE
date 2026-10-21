const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild'),{webcrypto}=require('node:crypto');
const uid='00000000-0000-4000-8000-000000000001',draftId='00000000-0000-4000-8000-000000000050';
function fixture({admin=false,authenticated=true,legal=true}={}){
 let handler;const calls=[],queries=[];
 const profile={perfil:admin?'MASTER':'MOTORISTA',ativo:admin,status_aprovacao:admin?'APROVADO':'PENDENTE',trocar_senha:false};
 class Q{constructor(t){this.t=t;this.filters=[];}select(v){this.columns=v;return this;}eq(k,v){this.filters.push([k,v]);return this;}or(v){this.filters.push(['or',v]);return this;}order(){return this;}limit(){return this;}single(){return this;}maybeSingle(){return this;}then(resolve){queries.push({table:this.t,filters:this.filters,columns:this.columns});let data=this.t==='usuarios_app'?profile:this.t==='motoristas'?{id:uid}:this.t==='registration_dossiers'?{kind:'MOTORISTA',status:'SUBMITTED'}:this.t==='vehicle_registration_drafts'?{id:draftId,status:'DRAFT'}:[];return Promise.resolve({data}).then(resolve);}}
 const db={from:t=>new Q(t),auth:{getUser:async()=>authenticated?{data:{user:{id:uid}}}:{error:Error('Auth'),data:{user:null}}},rpc:async(name,body)=>{if(name==='forte_legal_status')return{data:{accepted:legal}};calls.push({name,body});return{data:{revision:1}};},storage:{from:()=>({createSignedUploadUrl:async path=>{calls.push({path});return{data:{token:'signed'}};}})}};
 const context={module:{exports:{}},exports:{},require:()=>({createClient:()=>db}),Deno:{serve:fn=>handler=fn,env:{get:()=>''}},Request,Response,crypto:webcrypto,console};context.exports=context.module.exports;
 vm.runInNewContext(transformSync(fs.readFileSync('supabase/functions/vehicle-registry/index.ts','utf8'),{loader:'ts',format:'cjs'}).code,context);
 return{calls,queries,call:async(body,origin='https://forte-frete.onrender.com')=>{const r=await handler(new Request('https://fixture',{method:'POST',headers:{origin,authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,body:await r.json()};}};
}
test('vehicle API rejects foreign origin, invalid session, stale terms and candidate admin actions',async()=>{
 assert.equal((await fixture().call({},'https://other.invalid')).status,403);assert.equal((await fixture({authenticated:false}).call({})).status,401);assert.equal((await fixture({legal:false}).call({})).status,428);
 for(const action of ['ADMIN_LIST','REVIEW','LINK','UNLINK','DOCUMENTS'])assert.equal((await fixture().call({action,vehicle_id:draftId})).status,403);
});
test('save derives owner from JWT, strips privilege fields, prevents foreign paths',async()=>{
 const f=fixture(),r=await f.call({action:'SAVE',id:draftId,revision:3,user_id:'foreign',data:{plate:'ABC1D23',motorista_id:'foreign',status_aprovacao:'APROVADO',favorecido_id:'foreign',files:{cavalo:uid+'/file.pdf'}}});assert.equal(r.status,200);
 const call=f.calls[0];assert.equal(call.body.p_user,uid);assert.equal(call.body.p_revision,3);assert.equal(call.body.p_data.plate,'ABC1D23');for(const k of ['motorista_id','status_aprovacao','favorecido_id'])assert.equal(k in call.body.p_data,false);
 assert.equal((await f.call({action:'SAVE',id:draftId,revision:3,data:{files:{cavalo:'foreign/file.pdf'}}})).status,400);
});
test('review and explicit link derive administrative actor; candidate lookup exposes minimal fields',async()=>{
 const f=fixture({admin:true});for(const action of ['REVIEW','LINK','UNLINK']){assert.equal((await f.call({action,vehicle_id:draftId,driver_id:uid,decision:'APROVADO',actor:'forged'})).status,200);assert.equal(f.calls.at(-1).body.p_actor,uid);}
 const d=fixture();await d.call({action:'LOOKUP',plate:'ABC1D23'});assert.equal(d.queries.at(-1).columns,'id,placa,status_aprovacao');assert.deepEqual(d.queries.at(-1).filters,[['placa','ABC1D23']]);
});
test('uploads require owned draft and enforce size, MIME, namespace',async()=>{
 const f=fixture();for(const patch of [{kind:'foto_frente',mime:'application/pdf',size:10},{kind:'cavalo',mime:'text/html',size:10},{kind:'cavalo',mime:'application/pdf',size:10485761}])assert.equal((await f.call({action:'UPLOAD',id:draftId,...patch})).status,400);
 assert.equal((await f.call({action:'UPLOAD',id:draftId,kind:'foto_frente',mime:'image/png',size:10})).status,200);assert(f.calls[0].path.startsWith(uid+'/'+draftId+'/'));
 const q=f.queries.filter(q=>q.table==='vehicle_registration_drafts').at(-1);assert(q.filters.some(([k,v])=>k==='user_id'&&v===uid));
});
