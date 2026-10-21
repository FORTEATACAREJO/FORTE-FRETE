const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild');
function render(kind='MOTORISTA'){
 const context={module:{exports:{}},exports:{},require:()=>({confirmLegal:async()=>{}})};context.exports=context.module.exports;
 vm.runInNewContext(transformSync(fs.readFileSync('registration-dossier.js','utf8'),{loader:'js',format:'cjs'}).code,context);
 const fields={},nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',hidden:false});return nodes.get(key);};
 const form={dataset:{},elements:fields,querySelectorAll:()=>[],querySelector:node,addEventListener(){}};
 const host={hidden:true,querySelector:key=>key==='form'?form:node(key),set innerHTML(value){this.html=value;for(const m of value.matchAll(/<(input|select)\b([^>]*\bname="([^"]+)"[^>]*)>/g))fields[m[3]]={value:m[3]==='payment_method'?'PIX':'',required:/\brequired\b/.test(m[2])};}};
 context.module.exports.createRegistrationDossier({}).render(host,{kind});return{host,form,fields,node};
}
test('personal registration does not require vehicle, owner or beneficiary fields',()=>{
 const {fields}=render();assert.equal(fields.email.required,false);
 for(const k of ['owner_name','owner_document','owner_whatsapp','plate','capacity','beneficiary_name','beneficiary_document','pix_key'])assert.equal(fields[k],undefined,k);
 for(const k of ['nome','cpf','whatsapp','cnh_number'])assert.equal(fields[k].required,true,k);
});
test('vehicle owner shortcut preserves the separately proposed payment recipient',()=>{
 const context={module:{exports:{}},exports:{},require:()=>({confirmLegal:async()=>{}})};context.exports=context.module.exports;
 vm.runInNewContext(transformSync(fs.readFileSync('vehicle-registration.js','utf8'),{loader:'js',format:'cjs'}).code,context);
 const fields=Object.fromEntries(['owner_name','owner_document','owner_whatsapp','beneficiary_name'].map(k=>[k,{value:k==='beneficiary_name'?'Outro favorecido':''}]));
 context.module.exports.copyVehicleOwner({elements:fields},{nome:'Motorista Fictício',cpf:'52998224725',whatsapp:'11999999999'});
 assert.equal(fields.owner_name.value,'Motorista Fictício');assert.equal(fields.owner_document.value,'52998224725');assert.equal(fields.owner_whatsapp.value,'11999999999');assert.equal(fields.beneficiary_name.value,'Outro favorecido');
});
test('employee fields remain unchanged',()=>{const{fields,host}=render('FUNCIONARIO');assert.equal(fields.email.required,true);assert.equal(fields.owner_name,undefined);assert(!host.html.includes('data-owner-driver'));});
