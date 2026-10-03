begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='masterforteatacarejo@gmail.com' limit 1),true);
create temporary table favored_results (scenario text,passed boolean,detail text);
create function pg_temp.check_favored(p_name text,p_document text,p_valid boolean)
returns void language plpgsql as $$
declare v_id uuid;
begin
 begin
  insert into public.favorecidos_frete(nome,cpf_cnpj) values ('SIMULAÇÃO',p_document) returning id into v_id;
  insert into favored_results values (p_name,p_valid,'Inserido');
  delete from public.favorecidos_frete where id=v_id;
 exception when check_violation then
  insert into favored_results values (p_name,not p_valid,sqlerrm);
 end;
end $$;
select pg_temp.check_favored(name,document,valid) from (values
 ('CPF válido','88346463634',true),
 ('CPF formatado','883.464.636-34',true),
 ('CNPJ Matriz','49832961000151',true),
 ('CNPJ Filial','49832961000232',true),
 ('CNPJ formatado','49.832.961/0001-51',true),
 ('CNPJ alfanumérico oficial','12ABC34501DE35',true),
 ('CNPJ alfanumérico minúsculo','12abc34501de35',true),
 ('CPF zerado','00000000000',false),
 ('CPF repetido','11111111111',false),
 ('CNPJ zerado','00000000000000',false),
 ('CPF DV incorreto','88346463635',false),
 ('CNPJ DV incorreto','49832961000152',false),
 ('CNPJ alfanumérico DV incorreto','12ABC34501DE36',false),
 ('Documento ausente',null,false),
 ('Documento vazio','',false),
 ('Documento truncado','8834646363',false),
 ('Caracteres adicionais','CPF88346463634',false),
 ('Dígitos Unicode','８８３４６４６３６３４',false)
) x(name,document,valid);
do $$
declare v_id uuid; v_document text;
begin
 insert into public.favorecidos_frete(nome,cpf_cnpj) values ('SIMULAÇÃO','12abc34501de35') returning id,cpf_cnpj into v_id,v_document;
 insert into favored_results values ('Normalização preserva letras',v_document='12ABC34501DE35',v_document);
 begin
  update public.favorecidos_frete set cpf_cnpj='00000000000' where id=v_id;
  insert into favored_results values ('UPDATE inválido rejeitado',false,'Aceito indevidamente');
 exception when check_violation then
  insert into favored_results values ('UPDATE inválido rejeitado',true,sqlerrm);
 end;
end $$;
select scenario,passed,detail from favored_results order by scenario;
rollback;
