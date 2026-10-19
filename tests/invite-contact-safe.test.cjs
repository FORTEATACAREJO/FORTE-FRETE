const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild');
const source=fs.readFileSync('user-invites.js','utf8');
function load(clipboard){
 const navigator={clipboard};Object.defineProperty(navigator,'contacts',{get(){throw Error('Native contact picker must never be touched');}});
 const context={module:{exports:{}},exports:{},navigator,Event,Response,URL,location:{origin:'https://fixture',pathname:'/'},FormData:class extends Map{constructor(form){super(Object.entries(form.elements).map(([k,v])=>[k,v.value]));}}};context.exports=context.module.exports;
 vm.runInNewContext(transformSync(source,{loader:'js',format:'cjs'}).code,context);return context.module.exports;
}
const input=()=>({value:'existing',focus(){this.focused=true},dispatchEvent(e){this.event=e}});
test('pastes formatted WhatsApp without opening the native contacts picker',async()=>{
 const ui=load({readText:async()=>'+55 (34) 99920-9335'}),phone=input(),status={};await ui.pasteInvitePhone(phone,status);
 assert.equal(phone.value,'5534999209335');assert.equal(phone.event.type,'input');assert.match(status.textContent,/Confira/);
});
test('clipboard denial, unsupported paste and invalid text retain typed data and allow manual entry',async()=>{
 for(const clipboard of [undefined,{readText:async()=>{throw Error('Denied')}},{readText:async()=>''},{readText:async()=>'9999'},{readText:async()=>'1'.repeat(1000)}]){
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

test('copied WhatsApp contacts accept one phone from text, vCard or an official link',async()=>{
 const ui=load();for(const text of ['Pessoa: (11) 99999-9999','Pessoa\n+55 (11) 99999-9999','BEGIN:VCARD\nVERSION:3.0\nFN:Pessoa Teste\nTEL;TYPE=CELL:+55 (11) 99999-9999\nEND:VCARD','https://wa.me/5511999999999','https://api.whatsapp.com/send?phone=5511999999999&text=Teste']){
  const phone=input(),status={},name={value:'',dispatchEvent(){}};await ui.pasteInvitePhone(phone,status,{readText:async()=>text},name);assert.equal(phone.value.replace(/^55/,''),'11999999999');assert.match(status.textContent,/Confira/);
 }
 const c=ui.copiedWhatsAppContact('BEGIN:VCARD\nFN:Pessoa Teste\nTEL:11999999999\nTEL:+55 11 99999-9999\nEND:VCARD');assert.equal(c.phones.length,1);assert.equal(c.name,'Pessoa Teste');
});
test('ambiguous contacts, untrusted links and missing DDD preserve the current phone',async()=>{
 const ui=load();for(const text of ['Pessoa\n(11) 99999-9999\n(34) 99920-9335','https://example.invalid/5511999999999','99999-9999','BEGIN:VCARD\nFN:Pessoa Teste\nNOTE:11999999999\nEND:VCARD']){const phone=input(),status={};await ui.pasteInvitePhone(phone,status,{readText:async()=>text});assert.equal(phone.value,'existing');}
});
function pickerFields(){return{input:input(),nameInput:{value:'',dispatchEvent(){}},status:{},choices:{innerHTML:'',querySelector(){return this.select||(this.select={})}}};}
function memory(){const m=new Map();return{getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
test('explicit agenda selection fills name and WhatsApp and clears its in-flight marker',async()=>{
 const ui=load(),f=pickerFields(),storage=memory();let called=0;
 const nav={contacts:{select:async(props,opts)=>{called++;assert.equal(props.join(','),'name,tel');assert.equal(opts.multiple,false);return[{name:['Pessoa Agenda'],tel:['+55 (34) 99920-9335']}]}}};
 await ui.selectInviteContact({...f,navigator:nav,storage});assert.equal(called,1);assert.equal(f.input.value,'5534999209335');assert.equal(f.nameInput.value,'Pessoa Agenda');assert.equal(storage.getItem('forte-contact-picker-pending'),undefined);
});
test('multiple agenda numbers require explicit choice without overwriting the existing phone',async()=>{
 const ui=load(),f=pickerFields();await ui.selectInviteContact({...f,navigator:{contacts:{select:async()=>[{name:['Pessoa Agenda'],tel:['11999999999','34999209335']}] }},storage:memory()});assert.equal(f.input.value,'existing');assert.match(f.status.textContent,/Escolha/);f.choices.select.onchange({target:{value:'34999209335'}});assert.equal(f.input.value,'34999209335');
});
test('unsupported, cancelled and failed native selection keep form data; previous unfinished picker is not retried',async()=>{
 const ui=load();for(const navigator of [{},{contacts:{select:async()=>{const e=Error('cancel');e.name='AbortError';throw e}}},{contacts:{select:async()=>{throw Error('native')}}}]){const f=pickerFields();await ui.selectInviteContact({...f,navigator,storage:memory()});assert.equal(f.input.value,'existing');assert(f.status.textContent);}
 const storage=memory();storage.setItem('forte-contact-picker-pending','1');const f=pickerFields();await ui.selectInviteContact({...f,storage,navigator:{contacts:{select:()=>{throw Error('Must not retry')}}}});assert.match(f.status.textContent,/última abertura/);assert.equal(f.input.value,'existing');
});
test('local vCard import fills only one selected contact and rejects bulk or oversized files',async()=>{
 const ui=load(),f=pickerFields(),text='BEGIN:VCARD\nVERSION:3.0\nFN:Pessoa Arquivo\nTEL:11999999999\nEND:VCARD';await ui.importInviteContact({size:text.length,text:async()=>text},f);assert.equal(f.input.value,'11999999999');assert.equal(f.nameInput.value,'Pessoa Arquivo');
 for(const file of [{size:5000,text:async()=>text},{size:text.length*2,text:async()=>text+'\n'+text}]){const bad=pickerFields();await ui.importInviteContact(file,bad);assert.equal(bad.input.value,'existing');}
});
