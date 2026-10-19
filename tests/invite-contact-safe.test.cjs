const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild');
const source=fs.readFileSync('user-invites.js','utf8');
function load(clipboard){
 const navigator={clipboard};Object.defineProperty(navigator,'contacts',{get(){throw Error('Native contact picker must never be touched');}});
 const context={module:{exports:{}},exports:{},navigator,Event,Response,location:{origin:'https://fixture',pathname:'/'},FormData:class extends Map{constructor(form){super(Object.entries(form.elements).map(([k,v])=>[k,v.value]));}}};context.exports=context.module.exports;
 vm.runInNewContext(transformSync(source,{loader:'js',format:'cjs'}).code,context);return context.module.exports;
}
const input=()=>({value:'existing',focus(){this.focused=true},dispatchEvent(e){this.event=e}});
test('pastes formatted WhatsApp without opening the native contacts picker',async()=>{
 const ui=load({readText:async()=>'+55 (34) 99920-9335'}),phone=input(),status={};await ui.pasteInvitePhone(phone,status);
 assert.equal(phone.value,'5534999209335');assert.equal(phone.event.type,'input');assert.match(status.textContent,/Confira/);
});
test('clipboard denial, unsupported paste and invalid text retain typed data and allow manual entry',async()=>{
 for(const clipboard of [undefined,{readText:async()=>{throw Error('Denied')}},{readText:async()=>''},{readText:async()=>'Pessoa: 11999999999'},{readText:async()=>'9999'},{readText:async()=>'1'.repeat(1000)}]){
  const ui=load(clipboard),phone=input(),status={};await ui.pasteInvitePhone(phone,status);assert.equal(phone.value,'existing');assert.equal(phone.focused,true);assert.match(status.textContent,/Digite|digite/);
 }
});
for(const referral of [false,true])test('invitation '+(referral?'driver referral':'admin user')+' keeps screen and send flow after paste',async()=>{
 const calls=[],nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',innerHTML:'',disabled:false,querySelector:get});return nodes.get(id);};
 const form=get('#uiForm');form.elements={nome:{value:'Convidado fictício'},whatsapp:input()};get('#uiConsent').checked=true;
 const host={innerHTML:'',querySelector:get,querySelectorAll:()=>[]};
 const client={functions:{invoke:async(name,{body})=>{calls.push(body);if(body.action==='LIST')return{data:{invites:[],can_configure:false}};if(body.action==='CAPABILITIES')return{data:{}};if(body.action==='INVITE')return{data:{id:'fixture-invite',link:'https://fixture/?codigo=fixture',recipient_phone:body.whatsapp}};if(body.action==='SEND')return{data:{message:'Enviado em simulação'}};throw Error(body.action)}}};
 const ui=load({readText:async()=>'11999999999'});let closed=false;await ui.renderUserInvites({client,app:'frete',host,referral,onClose:()=>closed=true});
 assert(host.innerHTML.includes('COLAR NÚMERO DO WHATSAPP'));assert(!host.innerHTML.includes('SELECIONAR CONTATO'));
 await get('#uiContact').onclick();assert.equal(closed,false);assert.equal(form.elements.whatsapp.value,'11999999999');assert.equal(calls.some(x=>x.action==='SEND'),false);
 form.querySelector=get;await form.onsubmit({preventDefault(){}});assert.equal(calls.filter(x=>x.action==='INVITE').length,1);assert.equal(calls.filter(x=>x.action==='SEND').length,1);assert.equal(calls.find(x=>x.action==='INVITE').whatsapp,'11999999999');assert.equal(closed,false);assert.equal(get('#uiContact').disabled,false);
});
