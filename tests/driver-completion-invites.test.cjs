const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('targeted completion invitation protects imported data and preserves independent identity review',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create table auth.users(id uuid primary key);
 create table usuarios_app(user_id uuid primary key,cpf text,perfil text,ativo boolean,status_aprovacao text,trocar_senha boolean);
 create table access_requests(id uuid primary key default gen_random_uuid(),user_id uuid,app text,status text,cpf text,whatsapp text,created_at timestamptz default now());
 create table motoristas(id uuid primary key default gen_random_uuid(),nome text,cpf text,telefone text,auth_user_id uuid,status_cadastro text,dados_legados jsonb,cnh_registro text,categoria_cnh text,validade_cnh date,endereco text,numero text,bairro text,cep text);
 create table registration_dossiers(user_id uuid primary key,kind text,status text default 'DRAFT',data jsonb default '{}',revision integer default 0,updated_at timestamptz);
 create table access_audit(app text,event text,user_id uuid);
 create function private.access_is_admin(p uuid) returns boolean language sql as $$select exists(select 1 from public.usuarios_app where user_id=p and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR'))$$;`);
 const doc=fs.readFileSync('supabase/migrations/20261003203943_validar_documento_favorecido.sql','utf8').split('create or replace function private.guardar_documento_favorecido')[0];await db.exec(doc);
 await db.exec(fs.readFileSync('supabase/migrations/20261013010515_manual_access_invites_with_profile_chosen_on_approval.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261020224113_driver_completion_invites.sql','utf8'));
 for(const n of [1,2,3,99])await db.query('insert into auth.users values($1)',[id(n)]);
 await db.query("insert into usuarios_app values($1,null,'MASTER',true,'APROVADO',false)",[id(99)]);
 const person=async(n,cpf='52998224725',phone='5511999999999',kind='MOTORISTA')=>{
  await db.query("insert into usuarios_app values($1,$2,'MOTORISTA',false,'PENDENTE',false)",[id(n),cpf]);
  await db.query("insert into access_requests(user_id,app,status,cpf,whatsapp) values($1,'frete','PENDENTE',$2,$3)",[id(n),cpf,phone]);
  await db.query("insert into registration_dossiers(user_id,kind,data) values($1,$2,$3)",[id(n),kind,{cidade:'Nova cidade',cnh_number:'',files:{cnh_frente:id(n)+'/own.pdf'},declaracao:false,plates:{carreta_1:'NOV1A23'}}]);
 };
 await person(1);await person(2,'11144477735');await person(3,'52998224725','5511988888888','FUNCIONARIO');
 await db.query("insert into motoristas(id,nome,cpf,telefone,status_cadastro,cnh_registro,dados_legados) values($1,'Motorista fictício','529.982.247-25','(11) 99999-9999','legado','12345678901',$2)",[id(101),{completion_draft:{cidade:'Cidade antiga',cnh_number:'antigo',pix_key:'fixture@example.invalid',plate:'TES1T23',files:{cnh_frente:'foreign.pdf'},declaracao:true,role:'MASTER',plates:{carreta_1:'ANT1A23',carreta_2:'ANT2B34'}},pendenciasCadastro:['Conferir placas'] }]);
 const create=(actor=99,phone='5511999999999')=>db.query('select driver_completion_invite_create($1,$2,$3) as r',[id(actor),id(101),phone]);
 await assert.rejects(create(1),/Somente admin/);await assert.rejects(create(99,'5511988888888'),/WhatsApp/);
 const invite=(await create()).rows[0].r;assert(invite.token);assert.equal(invite.pix_key,undefined);
 const claim=(n,token=invite.token)=>db.query("select access_invite_claim($1,$2,'frete')",[id(n),token]);
 await assert.rejects(claim(2),/outro CPF/);
 assert.equal((await db.query('select claimed_by from access_invites where id=$1',[invite.id])).rows[0].claimed_by,null);
 assert.equal((await db.query('select revision from registration_dossiers where user_id=$1',[id(2)])).rows[0].revision,0);
 await assert.rejects(claim(3),/outro aplicativo\/WhatsApp/);
 await db.query("update access_invites set expires_at=now()-interval '1 second' where id=$1",[invite.id]);await assert.rejects(claim(1),/expirado/);
 await db.query("update access_invites set expires_at=now()+interval '1 hour' where id=$1",[invite.id]);
 await claim(1);let d=(await db.query('select * from registration_dossiers where user_id=$1',[id(1)])).rows[0];
 assert.equal(d.data.cidade,'Nova cidade');assert.equal(d.data.cnh_number,'12345678901');assert.equal(d.data.plate,'TES1T23');assert.equal(d.data.pix_key,'fixture@example.invalid');assert.equal(d.data.files.cnh_frente,id(1)+'/own.pdf');assert.equal(d.data.declaracao,false);assert.equal(d.data.role,undefined);assert.equal(d.data.plates.carreta_1,'NOV1A23');assert.equal(d.data.plates.carreta_2,'ANT2B34');assert.equal(d.revision,1);assert.equal(d.completion_driver_id,id(101));
 assert.deepEqual(d.completion_warnings,['Conferir placas']);
 await db.query("update registration_dossiers set data=data||'{\"pix_key\":\"edited\"}' where user_id=$1",[id(1)]);await claim(1);d=(await db.query('select * from registration_dossiers where user_id=$1',[id(1)])).rows[0];assert.equal(d.revision,1);assert.equal(d.data.pix_key,'edited');
 assert.equal((await db.query('select auth_user_id from motoristas where id=$1',[id(101)])).rows[0].auth_user_id,null);
 assert.equal((await db.query('select ativo from usuarios_app where user_id=$1',[id(1)])).rows[0].ativo,false);
 assert.equal((await db.query('select status from access_requests where user_id=$1',[id(1)])).rows[0].status,'PENDENTE');
 // Non-targeted invitations keep their existing behavior for employees.
 const generic=(await db.query("insert into access_invites(app,created_by,recipient_phone) values('frete',$1,'5511988888888') returning token",[id(99)])).rows[0];await claim(3,generic.token);
 await db.query("update motoristas set cpf='11111111111' where id=$1",[id(101)]);await assert.rejects(create(),/CPF válido/);
 await db.query("update motoristas set cpf='52998224725',auth_user_id=$2 where id=$1",[id(101),id(1)]);await assert.rejects(create(),/já tem acesso/);
 await db.exec('set role authenticated');try{await assert.rejects(create(),/permission denied/);await assert.rejects(claim(1),/permission denied/);}finally{await db.exec('reset role')}
 }finally{await db.close();}
});
