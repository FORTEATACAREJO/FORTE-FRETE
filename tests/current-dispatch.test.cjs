const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('current acceptance preserves 800 ordered, dispatches 760 within 38t and replays one outbox event',async()=>{
 const db=new PGlite();try{
  await db.exec(fs.readFileSync('tests/private-loads-fixture.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261016162214_private_load_dispatch.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261016170903_retorno_pedido_frete.sql','utf8'));
  await db.exec("alter table veiculos_motorista add column status_aprovacao text default 'PENDENTE';alter table cargas add column quantidade_pedida numeric,add column peso_pedido_t numeric");
  // Exercise the exact replacement eligibility/preview/acceptance functions against the complete dispatch schema.
  const migration=fs.readFileSync('supabase/migrations/20261020232538_independent_driver_vehicle_reviews.sql','utf8');await db.exec(migration.slice(migration.indexOf('create or replace function private.frete_elegivel')).replace(/commit;\s*$/i,''));
  await db.query("insert into usuarios_app(user_id,perfil,ativo,status_aprovacao,trocar_senha) values($1,'MASTER',true,'APROVADO',false),($2,'MOTORISTA',true,'APROVADO',false)",[id(1),id(11)]);
  await db.query("insert into motoristas(id,auth_user_id,nome,status_cadastro,validade_cnh,preferencia_todas_rotas) values($1,$1,'Teste','aprovado','2035-01-01',true)",[id(11)]);
  await db.query("insert into veiculos_motorista(id,motorista_id,placa,ativo,capacidade_efetiva_t,conjunto_principal,status_aprovacao) values($1,$2,'TST1A23',true,38,true,'PENDENTE')",[id(12),id(11)]);
  await db.query("insert into cargas(id,origem_cidade,origem_uf,destino_cidade,destino_uf,produto,peso_t,peso_min_t,peso_max_t,peso_unitario_kg,quantidade_pedida,peso_pedido_t,frete_por_t,status) values($1,'Origem','MG','Destino','GO','Produto teste',40,38,40,50,800,40,100,'rascunho')",[id(101)]);
  async function actor(user,sql,args){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return (await db.query(sql,args)).rows[0]?.r;}finally{await db.exec('reset role');}}
  await db.query("update veiculos_motorista set status_aprovacao='APROVADO' where id=$1",[id(12)]);
  await actor(id(1),"select frete_ofertar($1,$2,'privada') r",[id(101),id(11)]);
  await db.query("update veiculos_motorista set status_aprovacao='PENDENTE' where id=$1",[id(12)]);
  assert.equal((await actor(id(11),"select frete_operacao('CARGAS',null) r",[])).length,0);
  await assert.rejects(actor(id(11),"select frete_operacao('ACEITAR',$1) r",[id(101)]),/indisponível|capacidade|elegível/i);
  await db.query("update veiculos_motorista set status_aprovacao='APROVADO' where id=$1",[id(12)]);
  const accept=()=>actor(id(11),"select frete_operacao('ACEITAR',$1) r",[id(101)]);const result=await accept();assert.equal(result.quantidade,760);assert.equal(result.peso_t,38);assert.equal((await accept()).replayed,true);
  const events=(await db.query('select payload from integracao_forte_vendas')).rows;assert.equal(events.length,1);assert.equal(events[0].payload.quantidade,760);assert.equal(events[0].payload.quantidade_pedida,800);assert.equal(events[0].payload.peso_pedido_t,40);
  assert.equal((await db.query('select quantidade_pedida from cargas')).rows[0].quantidade_pedida,'800');
 }finally{await db.close();}
});
