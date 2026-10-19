const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('agreed freight overrides the table; only blank uses a unique active route and zero is explicit',async()=>{
 const {findFreightRate,resolveFreightRate}=await import('../frete-rates.mjs'),t={id:'rate',origem:'Arcos/MG',destino:'Catalão/GO',valor_por_t:100,ativa:true};
 assert.equal(findFreightRate([t],'ARCOS / MG','Catalao GO').id,'rate');assert.equal(findFreightRate([{...t,ativa:false}],'Arcos/MG','Catalão/GO'),null);
 assert.deepEqual(resolveFreightRate('',t),{valor:100,fonte:'TABELA',tarifaId:'rate'});assert.equal(resolveFreightRate('125.50',t).valor,125.5);assert.equal(resolveFreightRate('0',t).valor,0);assert.equal(resolveFreightRate(0,t).fonte,'COMBINADO');
 for(const v of [-1,'NaN','Infinity',false,[],{}])assert.throws(()=>resolveFreightRate(v,t));assert.throws(()=>resolveFreightRate('',null),/Informe/);assert.equal(findFreightRate([t,{...t,id:'duplicate'}],'Arcos/MG','Catalão/GO'),null);
});
test('SQL permits admin editing before acceptance, records the change and never reprices saved loads after tariff edits',async()=>{
 const db=new PGlite();try{await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function private.is_admin() returns boolean language sql stable as $$select coalesce(auth.uid()='00000000-0000-4000-8000-000000000009',false)$$;
 grant usage on schema public,private,auth to authenticated,anon;
 create table cargas(id uuid primary key,status text,oferta_status text,frete_por_t numeric);create table viagens(carga_id uuid);
 create table frete_ofertas_auditoria(carga_id uuid,autor_id uuid,evento text,anterior jsonb,atual jsonb);
 grant select,update on cargas to authenticated;grant select on viagens to authenticated;`);await db.exec(fs.readFileSync('supabase/fixes/tabela-frete-sugestao.sql','utf8'));
 await db.query("insert into cargas(id,status,oferta_status,frete_por_t) values($1,'rascunho','pendente',90),($2,'publicada','aceita',95)",[id(1),id(2)]);
 await db.query('insert into viagens values($1)',[id(2)]);await db.exec("set role authenticated;select set_config('test.uid','00000000-0000-4000-8000-000000000009',false)");
 await db.query("insert into frete_tarifas(id,origem,destino,valor_por_t) values($1,'Arcos/MG','Catalão/GO',100)",[id(3)]);
 await db.query('select frete_alterar_valor($1,125.50)',[id(1)]);assert.equal(Number((await db.query('select frete_por_t from cargas where id=$1',[id(1)])).rows[0].frete_por_t),125.5);
 await db.query("select frete_alterar_valor($1,100,'TABELA',$2)",[id(1),id(3)]);await db.query('update frete_tarifas set valor_por_t=150 where id=$1',[id(3)]);assert.equal(Number((await db.query('select frete_por_t from cargas where id=$1',[id(1)])).rows[0].frete_por_t),100);
 await assert.rejects(db.query("select frete_alterar_valor($1,100,'TABELA',$2)",[id(1),id(3)]),/sugestão/);await assert.rejects(db.query('select frete_alterar_valor($1,120)',[id(2)]),/já aceita/);
 await db.exec("select set_config('test.uid','00000000-0000-4000-8000-000000000008',false)");await assert.rejects(db.query('select frete_alterar_valor($1,1)',[id(1)]),/administração/);assert.equal((await db.query('select count(*)::int as n from frete_tarifas')).rows[0].n,0);await assert.rejects(db.query("insert into frete_tarifas(origem,destino,valor_por_t) values('A/MG','B/GO',1)"),/row-level security/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from frete_ofertas_auditoria')).rows[0].n,2);
 }finally{await db.close();}
});
