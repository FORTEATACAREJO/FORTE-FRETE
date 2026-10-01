begin;
update public.usuarios_app set trocar_senha=false where user_id='eadb46b7-5b1c-4011-8d70-3fb8bab6ce34';
select set_config('request.jwt.claims','{"sub":"eadb46b7-5b1c-4011-8d70-3fb8bab6ce34","role":"authenticated"}',true);
set local role authenticated;
do $$
declare a uuid;b uuid;v uuid;f uuid;t uuid;k uuid;blocked boolean:=false;
begin
 if not private.is_admin() then raise exception 'MASTER não reconhecido'; end if;
 insert into public.motoristas(nome,status_cadastro) values('TESTE A','aprovado') returning id into a;
 insert into public.motoristas(nome,status_cadastro) values('TESTE B','aprovado') returning id into b;
 insert into public.favorecidos_frete(nome,cpf_cnpj,banco) values('TESTE PROPRIETÁRIO','00000000000','Banco teste') returning id into f;
 k:=public.salvar_chave_pix_frete(f,'ALEATORIA','teste-principal',true);
 perform public.salvar_chave_pix_frete(f,'EMAIL','teste@example.invalid',true);
 if (select count(*) from public.chaves_pix_frete where favorecido_id=f and principal)<>1 then raise exception 'Pix principal inválido'; end if;
 insert into public.veiculos_motorista(motorista_id,tipo,placa,proprietario_nome,favorecido_id,componentes) values(a,'Rodotrem','TST1A00','TESTE PROPRIETÁRIO',f,'[{"papel":"carreta_1","placa":"TST1A01"}]') returning id into v;
 insert into public.documentos_veiculo(veiculo_id,tipo,arquivo_path) values(v,'cavalo','teste-sem-arquivo');
 insert into public.viagens(motorista_id,veiculo_id,origem,destino,status) values(a,v,'Origem teste','Destino teste','encerrada') returning id into t;
 perform public.trocar_motorista_veiculo(v,b);
 if not exists(select 1 from public.veiculos_motorista where id=v and motorista_id=b and favorecido_id=f and proprietario_nome='TESTE PROPRIETÁRIO' and componentes->0->>'placa'='TST1A01') then raise exception 'Dados do veículo alterados indevidamente';end if;
 if not exists(select 1 from public.viagens where id=t and motorista_id=a and favorecido_snapshot->>'nome'='TESTE PROPRIETÁRIO' and favorecido_snapshot->>'chave'='teste@example.invalid') then raise exception 'Histórico da viagem não preservado';end if;
 if (select count(*) from public.documentos_veiculo where veiculo_id=v)<>1 then raise exception 'Documento não preservado';end if;
 if not exists(select 1 from public.historico_motoristas_veiculo where veiculo_id=v and motorista_anterior_id=a and motorista_novo_id=b) then raise exception 'Auditoria ausente';end if;
 insert into public.viagens(motorista_id,veiculo_id,origem,destino,status) values(b,v,'Origem teste','Destino teste','em_viagem');
 begin perform public.trocar_motorista_veiculo(v,a); exception when others then blocked:=position('andamento' in sqlerrm)>0;end;
 if not blocked then raise exception 'Troca não bloqueada durante viagem'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$declare blocked boolean:=false;begin
 if private.is_admin() then raise exception 'Usuário desconhecido recebeu privilégio'; end if;
 if exists(select 1 from public.favorecidos_frete) or exists(select 1 from public.chaves_pix_frete) or exists(select 1 from public.documentos_veiculo) or exists(select 1 from public.historico_motoristas_veiculo) then raise exception 'RLS permite acesso indevido'; end if;
 begin perform public.trocar_motorista_veiculo(gen_random_uuid(),null);exception when others then blocked:=position('administrador' in sqlerrm)>0;end;
 if not blocked then raise exception 'Troca permitida a usuário desconhecido';end if;
end $$;
reset role;
rollback;
select 'PASS: MASTER, substituição, proprietário/veículos/documentos/Pix preservados, viagem histórica preservada, auditoria, bloqueio em viagem, isolamento RLS; testes revertidos.' as result;
