const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('legacy CPF claims save a separate pending dossier; only reviewed admin linkage exposes the legacy row',async()=>{
 const db=new PGlite();try{await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;create schema storage;
 create table usuarios_app(user_id uuid primary key,cpf text,perfil text,ativo boolean,status_aprovacao text,trocar_senha boolean,email text);
 create table access_requests(id uuid primary key default gen_random_uuid(),user_id uuid,app text,status text,nome text,cpf text,whatsapp text,email text,data_nascimento date,created_at timestamptz default now());
 create table motoristas(id uuid primary key default gen_random_uuid(),auth_user_id uuid unique,nome text,cpf text,telefone text,email text,data_nascimento date,status_cadastro text,chave_pix text);
 create unique index motoristas_cpf_normalized_unique on motoristas((regexp_replace(cpf,'[^0-9]','','g')));
 create table driver_onboarding(user_id uuid primary key,motorista_id uuid,documents_requested boolean default false,data jsonb default '{}',status text default 'DRAFT');
 create table registration_dossiers(user_id uuid primary key,kind text,status text default 'DRAFT',data jsonb default '{}',revision integer default 0,submitted_at timestamptz,updated_at timestamptz);
 create table access_audit(app text,event text,user_id uuid);
 create table storage.objects(bucket_id text,name text,metadata jsonb);
 create function private.access_is_admin(p uuid) returns boolean language sql as $$select exists(select 1 from public.usuarios_app where user_id=p and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR'))$$;
 grant usage on schema public,private to authenticated,service_role;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261019203542_cadastro_legado_vinculo_administrativo.sql','utf8'));
 const seed=async(n)=>{await db.query("insert into usuarios_app values($1,$2,'OPERADOR_GERAL',false,'PENDENTE',false,null)",[id(n),String(n).padStart(11,'0')]);await db.query("insert into access_requests(user_id,app,status,nome,cpf,whatsapp,data_nascimento) values($1,'frete','PENDENTE','Pessoa Fictícia',$2,'5511999999999','1980-01-01')",[id(n),String(n).padStart(11,'0')]);await db.query("insert into registration_dossiers(user_id,kind,data) values($1,'MOTORISTA','{\"cidade\":\"Preservada\",\"pix_key\":\"nova-proposta\"}')",[id(n)]);};
 const start=n=>db.query('select driver_onboarding_start($1) as result',[id(n)]);
 await db.query("insert into usuarios_app values($1,null,'MASTER',true,'APROVADO',false,null)",[id(99)]);
 await seed(1);await db.query("insert into motoristas(id,nome,cpf,status_cadastro,chave_pix) values($1,'Cadastro anterior','000.000.000-01','legado','pix-anterior')",[id(101)]);
 assert.equal((await start(1)).rows[0].result.status,'LEGACY_REVIEW_REQUIRED');
 assert.equal((await start(1)).rows[0].result.status,'LEGACY_REVIEW_REQUIRED');
 assert.equal((await db.query('select count(*)::int as n from motoristas')).rows[0].n,1);
 assert.equal((await db.query('select auth_user_id from motoristas where id=$1',[id(101)])).rows[0].auth_user_id,null);
 assert.equal((await db.query('select data from registration_dossiers where user_id=$1',[id(1)])).rows[0].data.cidade,'Preservada');
 await assert.rejects(db.query('select registration_dossier_submit($1)',[id(1)]),/Dados e anexos salvos/);
 await assert.rejects(db.query('select registration_legacy_match($1,$2)',[id(1),id(1)]),/Somente admin/);
 const match=(await db.query('select registration_legacy_match($1,$2) as r',[id(99),id(1)])).rows[0].r;assert.equal(match.id,id(101));assert.equal(match.available,true);assert.equal(match.chave_pix,undefined);
 const link=(actor,user,driver)=>db.query('select registration_link_legacy_driver($1,$2,$3)',[id(actor),id(user),id(driver)]);
 await assert.rejects(link(1,1,101),/Somente admin/);
 await assert.rejects(link(99,1,101),/salvar a CNH/);
 await db.query("update registration_dossiers set data=data||jsonb_build_object('files',jsonb_build_object('cnh_frente',$2::text)) where user_id=$1",[id(1),id(1)+'/cnh.pdf']);
 await db.query("insert into storage.objects values('motorista-documentos',$1,'{}')",[id(1)+'/cnh.pdf']);
 await seed(2);await start(2); // A fresh CPF follows the existing path normally.
 assert.equal((await db.query('select count(*)::int as n from motoristas where auth_user_id=$1',[id(2)])).rows[0].n,1);
 await db.query("insert into motoristas(id,cpf,status_cadastro) values($1,'00000000102','legado')",[id(102)]);
 await assert.rejects(link(99,1,102),/mesmo do novo cadastro/);
 await link(99,1,101); // Successful admin link preserves the old ID and Pix.
  assert.equal((await db.query('select chave_pix from motoristas where id=$1',[id(101)])).rows[0].chave_pix,'pix-anterior');
  assert.equal((await db.query('select ativo from usuarios_app where user_id=$1',[id(1)])).rows[0].ativo,false);
  assert.equal((await db.query('select status from access_requests where user_id=$1',[id(1)])).rows[0].status,'PENDENTE');
  assert.equal((await db.query('select status from registration_dossiers where user_id=$1',[id(1)])).rows[0].status,'DRAFT');
 await assert.rejects(link(99,1,101),/já vinculado/);
 assert.equal((await start(1)).rows[0].result.status,'DOCUMENTS_REQUIRED');
 await db.exec('set role authenticated');try{await assert.rejects(link(99,1,101),/permission denied/)}finally{await db.exec('reset role')}
 }finally{await db.close();}
});
