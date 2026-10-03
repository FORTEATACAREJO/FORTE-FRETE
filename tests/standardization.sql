-- Transactional regression test: all synthetic records are rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); m uuid; v uuid; f uuid;
begin
 insert into auth.users(id,aud,role,email) values(a,'authenticated','authenticated','audit-admin-'||a||'@example.invalid'),(u,'authenticated','authenticated','audit-driver-'||u||'@example.invalid');
 insert into public.usuarios_app(user_id,nome,cpf,whatsapp,email,perfil,ativo,status_aprovacao,trocar_senha)
 values(a,'ADMIN TESTE','11144477735','5534999990000','audit@example.invalid','ADMIN',true,'APROVADO',false),
 (u,'MOTORISTA TESTE','52998224725','5534999990001','driver@example.invalid','MOTORISTA',false,'PENDENTE',false);
 insert into public.motoristas(auth_user_id,nome,cpf,telefone,email,status_cadastro,cnh_registro,categoria_cnh,validade_cnh)
 values(u,'MOTORISTA TESTE','52998224725','5534999990001','driver@example.invalid','pre_cadastro','TESTE','AE','2030-10-03') returning id into m;
 insert into public.favorecidos_frete(nome,cpf_cnpj,criado_por) values('FAVORECIDO TESTE','52998224725',u) returning id into f;
 insert into public.chaves_pix_frete(favorecido_id,tipo,chave,principal) values(f,'CPF','52998224725',true);
 insert into public.veiculos_motorista(motorista_id,tipo,placa,capacidade_t,capacidade_efetiva_t,conjunto_principal,proprietario_nome,proprietario_cpf_cnpj,favorecido_id,cadastrado_por)
 values(m,'Carreta','TST1A23',38,38,true,'PROPRIETARIO TESTE','52998224725',f,u) returning id into v;
 insert into public.documentos_motorista(motorista_id,tipo,arquivo_path) select m,t,'audit/'||t from unnest(array['cnh_frente','cnh_verso']) t;
 insert into public.documentos_veiculo(veiculo_id,tipo,arquivo_path) select v,t,'audit/'||t from unnest(array['rntrc','cavalo','carreta_1','foto_conjunto']) t;
 perform set_config('forte.test_admin',a::text,true);perform set_config('forte.test_driver',u::text,true);perform set_config('forte.test_motorista',m::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('forte.test_driver'),true);
do $$ begin
 if private.is_operational() then raise exception 'FAIL: pending driver is operational'; end if;
 begin
   update public.motoristas set status_cadastro='aprovado' where id=current_setting('forte.test_motorista')::uuid;
   raise exception 'FAIL: self approval succeeded';
 exception when others then if position('A aprovação depende' in sqlerrm)=0 then raise; end if; end;
 begin
   perform public.analisar_cadastro_motorista(current_setting('forte.test_motorista')::uuid,'aprovado',null);
   raise exception 'FAIL: driver reviewed own dossier';
 exception when others then if position('Acesso exclusivo' in sqlerrm)=0 then raise; end if; end;
 update public.motoristas set status_cadastro='em_analise' where id=current_setting('forte.test_motorista')::uuid;
end $$;
select set_config('request.jwt.claim.sub',current_setting('forte.test_admin'),true);
do $$ begin
 begin
   perform public.analisar_cadastro_motorista(current_setting('forte.test_motorista')::uuid,'aprovado',null);
   raise exception 'FAIL: incomplete dossier approved';
 exception when others then if position('Complete e-mail' in sqlerrm)=0 then raise; end if; end;
end $$;
reset role;
update public.motoristas set data_nascimento='1980-01-01' where id=current_setting('forte.test_motorista')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('forte.test_admin'),true);
select public.analisar_cadastro_motorista(current_setting('forte.test_motorista')::uuid,'aprovado',null);
select set_config('request.jwt.claim.sub',current_setting('forte.test_driver'),true);
do $$ begin
 if not private.is_operational() then raise exception 'FAIL: approved driver remains blocked'; end if;
 if not exists(select 1 from public.usuarios_app where user_id=auth.uid() and ativo and status_aprovacao='APROVADO') then raise exception 'FAIL: user approval was not updated'; end if;
 if exists(select 1 from public.motoristas where auth_user_id<>auth.uid()) then raise exception 'FAIL: driver can read another dossier'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('forte.test_admin'),true);
select public.analisar_cadastro_motorista(current_setting('forte.test_motorista')::uuid,'reprovado','TESTE DE BLOQUEIO');
select set_config('request.jwt.claim.sub',current_setting('forte.test_driver'),true);
do $$ begin
 if private.is_operational() then raise exception 'FAIL: rejected driver is operational'; end if;
 if not exists(select 1 from public.usuarios_app where user_id=auth.uid() and not ativo and status_aprovacao='REPROVADO') then raise exception 'FAIL: rejection did not block user'; end if;
end $$;
reset role;
rollback;
select 'PASS: no self approval; incomplete dossier blocked; atomic approval and rejection; operational gate; dossier isolation; synthetic data rolled back' as result;
