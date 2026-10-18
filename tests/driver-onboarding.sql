begin;
do $test$
declare u uuid:=gen_random_uuid();m uuid;inv uuid;code uuid:=gen_random_uuid();d jsonb;v uuid;f uuid;k text;raised boolean;admin uuid;r uuid;u2 uuid:=gen_random_uuid();r2 uuid;
begin
 insert into auth.users(id,email) values(u,'rollback.'||u||'@example.invalid');
 select user_id into strict admin from public.usuarios_app where ativo and status_aprovacao='APROVADO' and perfil in ('ADMINISTRADOR','MASTER') and not trocar_senha limit 1;
 r:=public.access_register_profile(u,'frete','TESTE TRANSACIONAL MOTORISTA','52998224725','5564999999999','1980-01-01',null);
 if exists(select 1 from public.motoristas where auth_user_id=u) then raise exception 'Criou motorista antes da definição do perfil';end if;
 if public.access_review_with_role(r,admin,'APROVADO','MOTORISTA','{}',null)->>'status'<>'DOCUMENTS_REQUIRED' then raise exception 'Não solicitou os documentos';end if;
 select id into strict m from public.motoristas where auth_user_id=u;
 insert into public.convites_motorista(codigo,uso_ilimitado,target_phone,expires_at) values(code,false,'5564999999999',now()+interval '1 day') returning id into inv;
 perform public.access_claim_invite(u,code);perform public.access_claim_invite(u,code);
 if (select total_cadastros from public.convites_motorista where id=inv)<>1 then raise exception 'Convite contado mais de uma vez';end if;
 raised:=false;begin update public.motoristas set status_cadastro='aprovado' where id=m;exception when others then raised:=true;end;if not raised then raise exception 'Aprovou motorista sem documentos';end if;
 d:=jsonb_build_object('cnh_number','TEST-CNH','cnh_category','E','cnh_validity','2030-01-01','plate','ABC1D23','capacity',38,'owner_name','Teste Proprietário','owner_whatsapp','11999999999','beneficiary_name','Teste Favorecido','beneficiary_document','52998224725','pix_type','CPF','pix_key','52998224725','absent',jsonb_build_object('carreta_1',true,'dolly',true,'carreta_2',true));
 update public.driver_onboarding set data=d where user_id=u;
 raised:=false;begin perform public.driver_onboarding_submit(u);exception when others then raised:=true;end;if not raised then raise exception 'Aceitou documentos faltantes';end if;
 foreach k in array array['cnh_frente','cavalo','rntrc'] loop
  insert into storage.objects(bucket_id,name,metadata) values('motorista-documentos',u||'/rollback_'||k||'.pdf','{"mimetype":"application/pdf","size":100}');
  d:=jsonb_set(d,array['files'],coalesce(d->'files','{}')||jsonb_build_object(k,u||'/rollback_'||k||'.pdf'));
 end loop;
 update public.driver_onboarding set data=jsonb_set(d,'{files,cavalo}',to_jsonb('another-user/file.pdf'::text)) where user_id=u;
 raised:=false;begin perform public.driver_onboarding_submit(u);exception when others then raised:=true;end;if not raised then raise exception 'Aceitou documento de outro usuário';end if;
 update public.driver_onboarding set data=d where user_id=u;
 perform public.driver_onboarding_submit(u);perform public.driver_onboarding_submit(u);
 select vehicle_id,beneficiary_id into strict v,f from public.driver_onboarding where user_id=u;
 if (select status_cadastro from public.motoristas where id=m)<>'em_analise' or (select count(*) from public.veiculos_motorista where motorista_id=m)<>1 or (select count(*) from public.chaves_pix_frete where favorecido_id=f)<>1 then raise exception 'Envio duplicou dados ou liberou operação';end if;
 if (select count(*) from public.documentos_veiculo where veiculo_id=v)<>2 or (select count(*) from public.documentos_motorista where motorista_id=m)<>1 then raise exception 'Anexos não vinculados ao dossiê';end if;
 if (select ativo from public.usuarios_app where user_id=u) then raise exception 'Motorista foi liberado antes da análise';end if;
 perform public.access_review_with_role(r,admin,'APROVADO','MOTORISTA','{}',null);
 if (select status_cadastro from public.motoristas where id=m)<>'aprovado' or not (select ativo from public.usuarios_app where user_id=u) then raise exception 'Aprovação não sincronizou acesso e motorista';end if;
 insert into auth.users(id,email) values(u2,'rollback.'||u2||'@example.invalid');
 r2:=public.access_register_profile(u2,'frete','TESTE FUNCIONARIO','11144477735','5564999999998','1990-01-01',null);
 perform public.access_review_with_role(r2,admin,'APROVADO','OPERADOR_GERAL','{}',null);
 if exists(select 1 from public.motoristas where auth_user_id=u2) or not (select ativo from public.usuarios_app where user_id=u2) or (select perfil from public.usuarios_app where user_id=u2)<>'OPERADOR_GERAL' then raise exception 'Funcionário virou motorista ou ficou bloqueado por veículo/Pix';end if;
end;$test$;
rollback;
