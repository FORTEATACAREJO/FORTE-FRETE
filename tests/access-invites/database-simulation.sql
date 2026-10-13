begin;
do $test$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();i uuid;t uuid:=gen_random_uuid();r uuid;app text:='frete';raised boolean;
begin
 insert into auth.users(id,email) values(u,'rollback.'||u||'@example.invalid'),(v,'rollback.'||v||'@example.invalid');
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento,email) values(u,app,'CONVITE TESTE','52998224725','5564999999999','1980-01-01',null) returning id into r;
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento,email) values(v,app,'OUTRO TESTE','11144477735','5564999999998','1980-01-01',null);
 insert into public.access_invites(token,app,created_by,recipient_phone) values(t,app,u,'5564999999999') returning id into i;
 raised:=false;begin perform public.access_invite_claim(v,t,app);exception when others then raised:=true;end;if not raised then raise exception 'Outro WhatsApp usou o convite';end if;
 if (select claimed_by from public.access_invites where id=i) is not null then raise exception 'Tentativa inválida consumiu o convite';end if;
 perform public.access_invite_claim(u,t,app);perform public.access_invite_claim(u,t,app);
 if (select access_invite_id from public.access_requests where id=r)<>i or (select status from public.access_requests where id=r)<>'PENDENTE' then raise exception 'Vínculo concedeu aprovação ou falhou';end if;
 raised:=false;begin perform public.access_invite_claim(u,t,'outro-app');exception when others then raised:=true;end;if not raised then raise exception 'Convite usado em outro aplicativo';end if;
 if has_function_privilege('authenticated','public.access_invite_claim(uuid,uuid,text)','execute') or has_table_privilege('authenticated','public.access_invites','select,insert,update') then raise exception 'Cliente pode alterar convites diretamente';end if;
end;$test$;
rollback;
