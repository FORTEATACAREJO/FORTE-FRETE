begin;
insert into auth.users(id,email) values ('de1e7100-0000-4000-8000-000000000011','review-admin@example.invalid'),('de1e7100-0000-4000-8000-000000000012','review-driver@example.invalid');
insert into auth.sessions(id,user_id) values ('de1e7100-0000-4000-8000-000000000013','de1e7100-0000-4000-8000-000000000011');
insert into public.usuarios_app(user_id,nome,cpf,whatsapp,perfil,ativo,status_aprovacao,trocar_senha) values
 ('de1e7100-0000-4000-8000-000000000011','TESTE SINTETICO ADMIN','00000000011','5500000000011','MASTER',true,'APROVADO',false),
 ('de1e7100-0000-4000-8000-000000000012','TESTE SINTETICO MOTORISTA','00000000012','5500000000012','MOTORISTA',true,'APROVADO',false);
insert into public.frete_atendimento(id,user_id,tipo,mensagem) values ('de1e7100-0000-4000-8000-000000000014','de1e7100-0000-4000-8000-000000000012','EXCLUSAO','Teste com rollback; não executar exclusão');
do $$ declare report jsonb; begin
 report=public.frete_deletion_assess('de1e7100-0000-4000-8000-000000000011','de1e7100-0000-4000-8000-000000000013','de1e7100-0000-4000-8000-000000000014');
 if not (report->>'read_only')::boolean or (report->>'deleted')::boolean then raise exception 'Análise não é somente leitura';end if;
 if report->>'resultado'<>'SEM_VINCULO_OPERACIONAL_DETECTADO' then raise exception 'Conta sem vínculos não reconhecida';end if;
 update public.usuarios_app set perfil='MASTER' where user_id='de1e7100-0000-4000-8000-000000000012';
 report=public.frete_deletion_assess('de1e7100-0000-4000-8000-000000000011','de1e7100-0000-4000-8000-000000000013','de1e7100-0000-4000-8000-000000000014');
 if report->>'resultado'<>'REVISAO_OBRIGATORIA' then raise exception 'Conta Master não foi sinalizada';end if;
 update public.usuarios_app set ativo=false where user_id='de1e7100-0000-4000-8000-000000000011';
 begin perform public.frete_deletion_assess('de1e7100-0000-4000-8000-000000000011','de1e7100-0000-4000-8000-000000000013','de1e7100-0000-4000-8000-000000000014');raise exception 'Admin inativo autorizado';exception when insufficient_privilege then null;end;
 if not exists(select 1 from auth.users where id='de1e7100-0000-4000-8000-000000000012') or not exists(select 1 from public.frete_atendimento where id='de1e7100-0000-4000-8000-000000000014') then raise exception 'Análise alterou conta/protocolo';end if;
end $$;
set local role authenticated;
do $$ begin begin perform public.frete_deletion_assess('de1e7100-0000-4000-8000-000000000011','de1e7100-0000-4000-8000-000000000013','de1e7100-0000-4000-8000-000000000014');raise exception 'RPC privilegiada exposta ao cliente';exception when insufficient_privilege then null;end;end $$;
reset role;
select 'PASS: análise sem remoção, alerta Master, bloqueio de inativo e RPC não exposta; rollback' as result;
rollback;
