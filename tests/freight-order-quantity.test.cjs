const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id='00000000-0000-4000-8000-000000000111';
test('freight draft retries use one ID, retain ordered quantity and cannot mutate an offered/accepted load',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema private;create function private.is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='yes'$$;
 create table cargas(id uuid primary key,fornecedor text,local_expedicao text,origem_cidade text,origem_uf text,destino_cidade text,destino_uf text,produto text,peso_t numeric,peso_min_t numeric,peso_max_t numeric,peso_unitario_kg numeric,frete_por_t numeric,status text,oferta_status text default 'pendente');
 create table veiculos_motorista(id uuid primary key);
 create function frete_alterar_valor(uuid,numeric,text,uuid) returns jsonb language plpgsql as $$begin if $3 is null or $3 not in ('COMBINADO','TABELA') then raise exception 'Frete inválido';end if;return '{}';end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261020231805_freight_order_quantity_and_catalog.sql','utf8'));
 const body={fornecedor:'Fornecedor fictício',fornecedor_vendas_id:'supplier',produto:'Produto fictício',produto_vendas_id:'product',local_expedicao:'Local fictício',local_vendas_id:'place',origem_cidade:'Origem fictícia',origem_uf:'MG',origem_ibge_id:'3100001',destino_cidade:'Destino fictício',destino_uf:'GO',destino_ibge_id:'5200001',peso_unitario_kg:50,quantidade_pedida:800,peso_pedido_t:40,peso_min_t:38,peso_max_t:40,frete_por_t:0,frete_fonte:'COMBINADO'};
 const save=(patch={})=>db.query('select frete_salvar_rascunho($1,$2)',[id,{...body,...patch}]);
 await assert.rejects(save(),/Somente/);await db.exec("set test.admin='yes'");await save();await save();assert.equal((await db.query('select count(*)::int as n from cargas')).rows[0].n,1);
 let row=(await db.query('select * from cargas')).rows[0];assert.equal(Number(row.quantidade_pedida),800);assert.equal(Number(row.peso_pedido_t),40);assert.equal(Number(row.peso_min_t),38);assert.equal(row.status,'rascunho');
 for(const patch of [{peso_pedido_t:38},{peso_min_t:41},{peso_max_t:41},{quantidade_pedida:-1},{peso_unitario_kg:0},{frete_por_t:-1},{frete_por_t:'NaN'},{origem_ibge_id:'invalid'}])await assert.rejects(save(patch));
 await db.query("update cargas set status='publicada'");await assert.rejects(save(),/já ofertada/);await db.query("update cargas set status='atribuida',oferta_status='aceita'");await assert.rejects(save(),/já ofertada/);row=(await db.query('select * from cargas')).rows[0];assert.equal(Number(row.quantidade_pedida),800);assert.equal(Number(row.peso_pedido_t),40);await db.exec('set role anon');try{await assert.rejects(save(),/permission denied/);}finally{await db.exec('reset role')}
 }finally{await db.close();}
});
