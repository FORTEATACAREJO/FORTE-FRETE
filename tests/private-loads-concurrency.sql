-- Run against a disposable PostgreSQL 17 database, after private-loads-fixture.sql + migration.
insert into usuarios_app(user_id,nome,perfil,ativo,status_aprovacao,trocar_senha) values
('00000000-0000-4000-8000-000000000011','DEMO A','MOTORISTA',true,'APROVADO',false),
('00000000-0000-4000-8000-000000000012','DEMO B','MOTORISTA',true,'APROVADO',false);
insert into motoristas(id,auth_user_id,nome,status_cadastro,preferencia_todas_rotas) select user_id,user_id,nome,'aprovado',true from usuarios_app;
insert into veiculos_motorista(id,motorista_id,placa,ativo,capacidade_efetiva_t,conjunto_principal) select gen_random_uuid(),id,'DEM0A00',true,38,true from motoristas;
insert into cargas(id,origem_cidade,origem_uf,destino_cidade,destino_uf,peso_t,peso_min_t,peso_max_t,peso_unitario_kg,frete_por_t,status,produto) values('00000000-0000-4000-8000-000000000101','DEMO','MG','DEMO','GO',36,36,52,50,100,'publicada','PRODUTO DEMO');
