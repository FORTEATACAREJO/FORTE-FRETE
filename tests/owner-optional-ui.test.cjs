const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild');
function render(kind='MOTORISTA'){
 const context={module:{exports:{}},exports:{},require:()=>({confirmLegal:async()=>{}})};context.exports=context.module.exports;
 vm.runInNewContext(transformSync(fs.readFileSync('registration-dossier.js','utf8'),{loader:'js',format:'cjs'}).code,context);
 const fields={},nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',hidden:false});return nodes.get(key);};
 const form={dataset:{},elements:fields,querySelectorAll:()=>[],querySelector:node,addEventListener(){}};
 const host={hidden:true,querySelector:key=>key==='form'?form:node(key),set innerHTML(value){this.html=value;for(const m of value.matchAll(/<(input|select)\b([^>]*\bname="([^"]+)"[^>]*)>/g))fields[m[3]]={value:m[3]==='payment_method'?'PIX':'',required:/\brequired\b/.test(m[2])};}};
 context.module.exports.createRegistrationDossier({}).render(host,{kind});return{host,form,fields,node};
}
test('driver email and all owner fields are optional while driver, vehicle and payee remain required',()=>{
 const {fields}=render();for(const k of ['email','owner_name','owner_document','owner_whatsapp'])assert.equal(fields[k].required,false,k);
 for(const k of ['nome','cpf','whatsapp','cnh_number','plate','capacity','beneficiary_name','beneficiary_document','pix_key'])assert.equal(fields[k].required,true,k);
});
test('explicit owner shortcut copies the driver details without changing freight beneficiary',()=>{
 const {fields,node}=render();Object.assign(fields.nome,{value:'Motorista Fictício'});fields.cpf.value='52998224725';fields.whatsapp.value='11999999999';fields.beneficiary_name.value='Outro favorecido';
 node('[data-owner-driver]').onclick();assert.equal(fields.owner_name.value,fields.nome.value);assert.equal(fields.owner_document.value,fields.cpf.value);assert.equal(fields.owner_whatsapp.value,fields.whatsapp.value);assert.equal(fields.beneficiary_name.value,'Outro favorecido');
});
test('employee fields remain unchanged',()=>{const{fields,host}=render('FUNCIONARIO');assert.equal(fields.email.required,true);assert.equal(fields.owner_name,undefined);assert(!host.html.includes('data-owner-driver'));});
