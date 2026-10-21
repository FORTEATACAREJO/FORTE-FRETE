const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('personal approval, independent vehicle review, explicit links and trip preservation',async t=>{
 const db=new PGlite();try{
  await db.exec(fs.readFileSync('tests/independent-registration-fixture.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261003203943_validar_documento_favorecido.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261018205947_cadastro_unico_mobile.sql','utf8'));
  // frete_operacao's body is compiled on use; this suite tests eligibility separately from existing trip acceptance tests.
  await db.exec(fs.readFileSync('supabase/migrations/20261020232538_independent_driver_vehicle_reviews.sql','utf8'));
  for(const n of [1,2,99]){await db.query('insert into auth.users values($1)',[id(n)]);await db.query("insert into usuarios_app(user_id,perfil,status_aprovacao,ativo) values($1,$2,$3,$4)",[id(n),n===99?'MASTER':'MOTORISTA',n===99?'APROVADO':'PENDENTE',n===99]);}
  await db.query("insert into registration_dossiers(user_id,kind) values($1,'MOTORISTA')",[id(1)]);
  await db.query("insert into access_requests(user_id,app,status) values($1,'frete','PENDENTE')",[id(1)]);
  await db.query("insert into motoristas(id,auth_user_id,nome,status_cadastro,data_nascimento) values($1,$1,'Fictício','pre_cadastro','1980-01-01')",[id(1)]);
  const attach=async(k,mime='application/pdf',size=100)=>{const path=id(1)+'/'+k;await db.query("insert into storage.objects values('motorista-documentos',$1,$2)",[path,{mimetype:mime,size}]);return path;};
  const personal={cep:'12345678',logradouro:'Rua de teste',numero:'1',bairro:'Centro',cidade:'Cidade de teste',uf:'MG',declaracao:true,cnh_number:'12345678901',cnh_category:'E',cnh_validity:'2035-01-01',files:{cnh_frente:await attach('cnh')}};
  await db.query('update registration_dossiers set data=$1 where user_id=$2',[personal,id(1)]);
  await t.test('personal submission requires no vehicle and never creates payee or binding',async()=>{
   await db.query('select registration_dossier_submit($1)',[id(1)]);await db.query('select private.assert_driver_dossier($1)',[id(1)]);
   for(const table of ['veiculos_motorista','motorista_veiculo_vinculos','favorecidos_frete','chaves_pix_frete'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
   assert.equal((await db.query('select status_cadastro from motoristas')).rows[0].status_cadastro,'em_analise');
  });
  const files={};for(const k of ['cavalo','rntrc','foto_frente','foto_lateral'])files[k]=await attach(k,k.startsWith('foto_')?'image/png':'application/pdf');
  const data={plate:'ABC1D23',vehicle_type:'Carreta',brand:'Marca teste',model:'Modelo teste',year:2020,capacity:38,files,absent:{carreta_1:true,dolly:true,carreta_2:true},declaracao:true,pix_key:'PROPOSTA SEM ESCRITA FINANCEIRA'};
  const save=(n,revision=0,d=data,user=1)=>db.query('select vehicle_registration_save($1,$2,$3,$4)',[id(user),id(n),revision,d]);
  const submit=n=>db.query('select vehicle_registration_submit($1,$2) r',[id(1),id(n)]);
  let vehicle;
  await t.test('draft CAS ownership and independent submission are idempotent',async()=>{
   await assert.rejects(save(50,3),/inicial/);await save(50);await save(50,0);await assert.rejects(save(50,0),/outra tela/);
   await assert.rejects(save(50,1,data,2),/indisponível/);
   vehicle=(await submit(50)).rows[0].r.id;
   await db.query('select vehicle_registration_request_link($1,$2)',[id(1),vehicle]);await db.query('select vehicle_registration_request_link($1,$2)',[id(1),vehicle]);assert.equal((await db.query('select count(*)::int n from vehicle_link_requests')).rows[0].n,1);assert.equal((await submit(50)).rows[0].r.id,vehicle);
   const row=(await db.query('select * from veiculos_motorista')).rows[0];assert.equal(row.motorista_id,null);assert.equal(row.status_aprovacao,'EM_ANALISE');
   assert.equal((await db.query('select count(*)::int n from favorecidos_frete')).rows[0].n,0);
   await save(51);await assert.rejects(submit(51),/já está cadastrada/);
  });
  const review=(decision,actor=99)=>db.query('select vehicle_registration_review($1,$2,$3,$4)',[id(actor),vehicle,decision,'Conferência de teste']);
  const link=(unlink=false,driver=1)=>db.query('select vehicle_registration_link($1,$2,$3,$4,$5)',[id(99),vehicle,id(driver),unlink,'Alteração de teste']);
  await t.test('vehicle review cannot approve driver; link requires both approvals',async()=>{
   await assert.rejects(review('APROVADO',1),/Somente/);await review('APROVADO');
   assert.equal((await db.query('select status_cadastro from motoristas')).rows[0].status_cadastro,'em_analise');
   assert.equal((await db.query('select motorista_id from veiculos_motorista')).rows[0].motorista_id,null);
   await assert.rejects(link(),/separadamente/);
   await db.query("update motoristas set status_cadastro='aprovado' where id=$1",[id(1)]);await link();await link();assert.equal((await db.query('select status from vehicle_link_requests')).rows[0].status,'CONCLUIDA');
   assert.equal((await db.query('select count(*)::int n from motorista_veiculo_vinculos')).rows[0].n,1);
  });
  await t.test('physical capacity and listing require independently approved vehicle',async()=>{
   await db.query("update usuarios_app set ativo=true,status_aprovacao='APROVADO' where user_id=$1",[id(1)]);
   await db.query('insert into cargas(id,peso_min_t,peso_max_t,peso_unitario_kg,frete_por_t) values($1,38,40,50,0)',[id(500)]);
   let r=(await db.query('select private.frete_previa($1,$2) r',[id(500),id(1)])).rows[0].r;
   assert.equal(r.peso_estimado_t,38);assert.equal(r.quantidade_estimada,760);
   assert.equal((await db.query('select private.frete_elegivel($1,$2) r',[id(500),id(1)])).rows[0].r,true);
   await review('CORRECAO_SOLICITADA');assert.equal((await db.query('select private.frete_elegivel($1,$2) r',[id(500),id(1)])).rows[0].r,false);
   assert.deepEqual((await db.query('select private.frete_previa($1,$2) r',[id(500),id(1)])).rows[0].r,{});
   await review('APROVADO');
  });
  await t.test('active trip blocks link changes; unlink retains original trip and audit',async()=>{
   await db.query("insert into viagens(veiculo_id,status) values($1,'em_viagem')",[vehicle]);
   await assert.rejects(link(true),/viagem em andamento/);await assert.rejects(review('CORRECAO_SOLICITADA'),/viagem em andamento/);
   await db.query("update viagens set status='concluida'");await link(true);await link(true);
   assert.equal((await db.query('select motorista_id from veiculos_motorista')).rows[0].motorista_id,null);
   assert.equal((await db.query('select veiculo_id from viagens')).rows[0].veiculo_id,vehicle);
   assert((await db.query('select encerrado_em from motorista_veiculo_vinculos')).rows[0].encerrado_em);
  });
  await t.test('direct API cannot call privileged RPCs or forge approvals and links',async()=>{
   await db.exec('grant update,select on veiculos_motorista to authenticated;set role authenticated');try{
    await assert.rejects(review('APROVADO'),/permission denied/);await assert.rejects(link(),/permission denied/);
    await assert.rejects(db.query("update veiculos_motorista set status_aprovacao='REPROVADO'"),/análise separada/);
    await assert.rejects(db.query('update veiculos_motorista set motorista_id=$1',[id(1)]),/ação separada/);
    await assert.rejects(db.query('update veiculos_motorista set capacidade_efetiva_t=60'),/revisão/);
    await assert.rejects(db.query('select * from vehicle_registration_drafts'),/permission denied/);
   }finally{await db.exec('reset role');}
  });
 }finally{await db.close();}
});
