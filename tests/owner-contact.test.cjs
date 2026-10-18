const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_proprietario_nome_whatsapp_pix.sql'));
test('owner name and WhatsApp replace owner document without changing freight payee or approval checks',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema private;create schema storage;
   create table motoristas(id uuid primary key,auth_user_id uuid,nome text,cidade_uf text,cnh_registro text,categoria_cnh text,validade_cnh date,data_nascimento date,status_cadastro text,enviado_em timestamptz);
   create table veiculos_motorista(id uuid primary key default gen_random_uuid(),motorista_id uuid,favorecido_id uuid,tipo text,papel text,placa text,capacidade_t numeric,capacidade_efetiva_t numeric,conjunto_principal boolean,proprietario_nome text,proprietario_cpf_cnpj text,cadastrado_por uuid,componentes jsonb,ativo boolean default true,created_at timestamptz default now());
   create table driver_onboarding(user_id uuid primary key,motorista_id uuid,data jsonb,status text default 'DRAFT',vehicle_id uuid,beneficiary_id uuid,submitted_at timestamptz);
   create table favorecidos_frete(id uuid primary key default gen_random_uuid(),nome text,cpf_cnpj text,banco text,criado_por uuid,ativo boolean default true,created_at timestamptz default now());
   create table chaves_pix_frete(id uuid primary key default gen_random_uuid(),favorecido_id uuid,tipo text,chave text,principal boolean,ativo boolean default true);
   create table documentos_motorista(motorista_id uuid,tipo text,arquivo_path text);
   create table documentos_veiculo(veiculo_id uuid,tipo text,arquivo_path text);
   create table access_audit(app text,event text,user_id uuid);
   create table storage.objects(bucket_id text,name text);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261003203943_validar_documento_favorecido.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  const uid='00000000-0000-4000-8000-000000000001';
  await db.query("insert into motoristas(id,auth_user_id,nome,data_nascimento,status_cadastro) values($1,$1,'Motorista fictício','1980-01-01','pre_cadastro')",[uid]);
  const files=Object.fromEntries(['cnh_frente','cavalo','rntrc'].map(k=>[k,uid+'/'+k+'.pdf']));
  for(const path of Object.values(files))await db.query("insert into storage.objects values('motorista-documentos',$1)",[path]);
  const data={cnh_number:'TESTE-CNH',cnh_category:'AE',cnh_validity:'2032-01-01',plate:'ABC1D23',capacity:40,owner_name:'Proprietário fictício',owner_whatsapp:'(11) 99999-9999',beneficiary_name:'Outro favorecido fictício',beneficiary_document:'52998224725',pix_type:'EMAIL',pix_key:'pagamento@example.invalid',files,absent:{carreta_1:true,dolly:true,carreta_2:true}};
  await db.query('insert into driver_onboarding(user_id,motorista_id,data) values($1,$1,$2)',[uid,data]);
  const set=patch=>db.query('update driver_onboarding set data=$2 where user_id=$1',[uid,{...data,...patch}]);
  const submit=()=>db.query('select driver_onboarding_submit($1) as result',[uid]);
  await t.test('requires name and a WhatsApp with DDD, even if owner CPF is supplied',async()=>{
   for(const patch of [{owner_name:''},{owner_whatsapp:''},{owner_whatsapp:'9999',owner_document:'52998224725'}]){await set(patch);await assert.rejects(submit,/nome e WhatsApp/);}
  });
  await t.test('still requires an actual payment key and own mandatory documents',async()=>{
   await set({pix_key:''});await assert.rejects(submit,/tipo e chave Pix/);
   await set({files:{...files,cnh_frente:undefined}});await assert.rejects(submit,/Anexe CNH/);
   await set({files:{...files,cavalo:'another-user/file.pdf'}});await assert.rejects(submit,/não pertence/);
  });
  await t.test('submits without owner CPF, normalizes WhatsApp and keeps a separate payee',async()=>{
   await set({});assert.equal((await submit()).rows[0].result.status,'SUBMITTED');
   const v=(await db.query('select * from veiculos_motorista')).rows[0];
   assert.equal(v.proprietario_cpf_cnpj,null);assert.equal(v.proprietario_whatsapp,'11999999999');
   const f=(await db.query('select * from favorecidos_frete')).rows[0];assert.equal(f.nome,data.beneficiary_name);assert.notEqual(f.nome,v.proprietario_nome);
   assert.equal((await db.query('select chave from chaves_pix_frete')).rows[0].chave,data.pix_key);
   assert.equal((await db.query('select status_cadastro from motoristas')).rows[0].status_cadastro,'em_analise');
   await submit();assert.equal((await db.query('select count(*)::int n from veiculos_motorista')).rows[0].n,1);
  });
  await t.test('approval gate accepts no owner document but rejects missing contact or attachments',async()=>{
   await db.query('select private.assert_driver_dossier($1)',[uid]);
   await db.exec("update veiculos_motorista set proprietario_whatsapp='' ");await assert.rejects(()=>db.query('select private.assert_driver_dossier($1)',[uid]),/WhatsApp/);
   await db.exec("update veiculos_motorista set proprietario_whatsapp='11999999999'");
   await db.exec("delete from documentos_veiculo where tipo='rntrc'");await assert.rejects(()=>db.query('select private.assert_driver_dossier($1)',[uid]),/rntrc/);
  });
  await t.test('correction preserves historical owner CPF and refuses to overwrite an existing Pix',async()=>{
   await db.exec("update motoristas set status_cadastro='pendencia';update driver_onboarding set status='DRAFT';update veiculos_motorista set proprietario_cpf_cnpj='HISTORICO'");
   await set({});await submit();assert.equal((await db.query('select proprietario_cpf_cnpj from veiculos_motorista')).rows[0].proprietario_cpf_cnpj,'HISTORICO');
   await db.exec("update motoristas set status_cadastro='pendencia';update driver_onboarding set status='DRAFT'");
   await set({pix_key:'outro@example.invalid'});await assert.rejects(submit,/dados diferentes/);
   assert.equal((await db.query('select chave from chaves_pix_frete')).rows[0].chave,data.pix_key);
  });
  await t.test('browser roles cannot submit as another user',async()=>{
   await db.exec('set role authenticated');try{await assert.rejects(submit,/permission denied/);}finally{await db.exec('reset role');}
  });
 }finally{await db.close();}
});
