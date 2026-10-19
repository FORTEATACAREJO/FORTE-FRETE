begin;
grant usage on schema private to service_role;
-- Unified term: staged only. The uploaded legal proposal is preserved verbatim.
create table if not exists public.forte_legal_term_versions (
 version text primary key,content_sha256 text not null,content_text text not null,active boolean not null default false,
 created_at timestamptz not null default now(),check(content_sha256=encode(sha256(convert_to(content_text,'UTF8')),'hex'))
);
create unique index if not exists forte_legal_single_active on public.forte_legal_term_versions(active) where active;
create table if not exists public.forte_legal_acceptance_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,module_key text not null check(module_key in ('frete','vendas','financeiro','fiscal','vendas_externas')),
 term_version text not null references public.forte_legal_term_versions(version),content_sha256 text not null,accepted_at timestamptz not null default clock_timestamp(),
 evidence_source text not null,receipt_id uuid not null unique default gen_random_uuid(),unique(user_id,module_key,term_version)
);
alter table public.forte_legal_term_versions enable row level security;
alter table public.forte_legal_acceptance_events enable row level security;
revoke all on public.forte_legal_term_versions,public.forte_legal_acceptance_events from public,anon,authenticated,service_role;
grant select on public.forte_legal_term_versions to anon,authenticated;
grant select on public.forte_legal_acceptance_events to authenticated;
grant select,insert on public.forte_legal_acceptance_events to service_role;
grant select,update(active) on public.forte_legal_term_versions to service_role;
drop policy if exists legal_terms_read on public.forte_legal_term_versions;
create policy legal_terms_read on public.forte_legal_term_versions for select to anon,authenticated using(true);
drop policy if exists legal_receipts_self on public.forte_legal_acceptance_events;
create policy legal_receipts_self on public.forte_legal_acceptance_events for select to authenticated using(user_id=(select auth.uid()));
create or replace function private.legal_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='forte_legal_term_versions' and tg_op='UPDATE' then if (to_jsonb(new)-'active')=(to_jsonb(old)-'active') then return new;end if;end if;
 raise exception 'Histórico de termos e aceites é imutável.' using errcode='42501';
end;$$;
drop trigger if exists legal_events_immutable on public.forte_legal_acceptance_events;
create trigger legal_events_immutable before update or delete on public.forte_legal_acceptance_events for each row execute function private.legal_immutable();
drop trigger if exists legal_versions_immutable on public.forte_legal_term_versions;
create trigger legal_versions_immutable before update or delete on public.forte_legal_term_versions for each row execute function private.legal_immutable();
insert into public.forte_legal_term_versions(version,content_sha256,content_text,active)
values('1.0','79d37d9ff0b462c98919ea9cdc735a9ab4ce9a6df905385913c6b7d6fb546d12',$forte_term$# TERMO DE CIÊNCIA DE PRIVACIDADE E CONFIDENCIALIDADE
**FORTE ATACAREJO LTDA.**
**Versão proposta:** 1.0 — sujeito à revisão jurídica antes de uso em produção.

**Abrangência:** Forte Frete, Forte Vendas, Forte Financeiro, Forte Fiscal e Forte Vendas Externas. Aplica-se a motoristas, funcionários, administradores, Masters e demais usuários.

## 1. CIÊNCIA SOBRE O TRATAMENTO DE DADOS PESSOAIS
O usuário declara ter acesso à Política de Privacidade aplicável e estar ciente das finalidades informadas para o tratamento de seus dados, incluindo cadastro, verificação, autenticação, operação dos serviços, gestão de cargas e pagamentos quando aplicável e cumprimento de obrigações legais. O aviso de privacidade deve indicar controlador, canais de contato, compartilhamentos, retenção e direitos do titular.

## 2. PROTEÇÃO DE DADOS PESSOAIS — LGPD
A Forte e os usuários devem observar a legislação aplicável e tratar dados pessoais somente quando necessário, para finalidades legítimas e com base legal adequada. Esta ciência não é consentimento genérico para qualquer tratamento; consentimentos específicos, quando necessários, serão solicitados separadamente.

## 3. CONFIDENCIALIDADE DE DOCUMENTOS E INFORMAÇÕES
O usuário compromete-se a proteger documentos, arquivos, dados cadastrais, pedidos, comprovantes e informações não públicas a que tenha acesso em razão de sua atividade, observando suas permissões.

## 4. SIGILO COMERCIAL, FINANCEIRO E FISCAL
Não divulgar informações internas de preços, negociações, contratos, pagamentos, resultados, notas fiscais, obrigações tributárias e estratégias comerciais sem autorização ou obrigação legal.

## 5. PROTEÇÃO DAS INFORMAÇÕES DE CLIENTES, FORNECEDORES E MOTORISTAS
Usar informações de terceiros exclusivamente para as atividades autorizadas, evitando cópias, exportações ou compartilhamentos desnecessários.

## 6. USO RESPONSÁVEL DOS SISTEMAS FORTE
Acessar apenas os módulos e registros necessários às tarefas autorizadas. O aceite deste termo não concede acesso: cada módulo exige aprovação própria do Master responsável.

## 7. PROIBIÇÃO DE DIVULGAÇÃO E COMPARTILHAMENTO NÃO AUTORIZADO
Não encaminhar documentos, capturas de tela, credenciais ou informações confidenciais a terceiros ou canais não autorizados. Permanecem ressalvadas comunicações legalmente exigidas e exercício regular de direitos.

## 8. SEGURANÇA DE SENHAS, DOCUMENTOS E ACESSOS
Manter credenciais pessoais sob sigilo, não compartilhar contas, proteger dispositivos e informar perda, suspeita de acesso indevido ou vazamento pelos canais oficiais.

## 9. RESPONSABILIDADE PELO USO DAS INFORMAÇÕES
O usuário deverá observar as regras de segurança e confidencialidade e poderá estar sujeito às medidas cabíveis previstas na legislação e nos instrumentos aplicáveis, assegurados os direitos pertinentes.

## 10. COMUNICAÇÃO DE INCIDENTES DE SEGURANÇA
Comunicar prontamente à administração responsável qualquer suspeita de acesso indevido, exposição, perda ou alteração não autorizada de documentos ou informações.

## 11. MANUTENÇÃO DO SIGILO APÓS O ENCERRAMENTO DO VÍNCULO
O dever de confidencialidade continua após o término do acesso enquanto a informação permanecer legitimamente confidencial, sem impedir deveres legais de comunicação e exercício de direitos.

## 12. DECLARAÇÃO DE CIÊNCIA E COMPROMISSO
Declaro que tive acesso ao Termo de Ciência de Privacidade e Confidencialidade e à Política de Privacidade aplicável, estou ciente do tratamento dos meus dados pessoais para as finalidades informadas e comprometo-me a manter o sigilo de documentos e informações protegidos aos quais tiver acesso, observadas as exceções legais.

**Caixa única obrigatória, inicialmente desmarcada:**

[ ] Li e estou ciente do Termo de Ciência de Privacidade e aceito o Termo de Confidencialidade e Sigilo de Documentos e Informações.

**Registro eletrônico:** identificação do usuário, módulo, versão e hash do termo, data e hora UTC, com histórico auditável e comprovante.

**Atenção:** minuta técnica para revisão jurídica e validação de Política de Privacidade, retenção, transparência e base legal antes da publicação.
$forte_term$,not exists(select 1 from public.forte_legal_term_versions where active)) on conflict(version) do nothing;
do $$begin if not exists(select 1 from public.forte_legal_term_versions where version='1.0' and content_sha256='79d37d9ff0b462c98919ea9cdc735a9ab4ce9a6df905385913c6b7d6fb546d12') then raise exception 'Versão 1.0 já existe com outro conteúdo. Crie nova versão sem sobrescrever histórico.';end if;end;$$;
-- app alias preserves existing operational keys; evidence uses the package's canonical key.
create or replace function private.legal_module(p_app text) returns text language sql immutable set search_path='' as $$select case when p_app='venda-externa' then 'vendas_externas' else p_app end$$;
create or replace function private.legal_supported(p_app text) returns boolean language sql immutable set search_path='' as $$select p_app=any(array['frete']::text[])$$;
create or replace function private.legal_has_current(p_user uuid,p_app text) returns boolean language sql stable security definer set search_path='' as $$
 select case when not private.legal_supported(p_app) then true else p_user is not null and exists(select 1 from public.forte_legal_term_versions t join public.forte_legal_acceptance_events e on e.term_version=t.version and e.content_sha256=t.content_sha256 where t.active and e.user_id=p_user and e.module_key=private.legal_module(p_app)) end;
$$;
create or replace function public.forte_legal_status(p_user uuid,p_app text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t public.forte_legal_term_versions;
begin
 if not private.legal_supported(p_app) then raise exception 'Módulo inválido.';end if;
 select * into strict t from public.forte_legal_term_versions where active;
 return jsonb_build_object('accepted',private.legal_has_current(p_user,p_app),'module',private.legal_module(p_app),'version',t.version,'hash',t.content_sha256,'text',t.content_text);
end;$$;
create or replace function public.forte_legal_accept(p_user uuid,p_app text,p_version text,p_hash text,p_confirmed boolean,p_source text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.forte_legal_term_versions;e public.forte_legal_acceptance_events;
begin
 if p_confirmed is distinct from true or not private.legal_supported(p_app) then raise exception 'Confirme a ciência e o compromisso neste módulo.';end if;
 select * into strict t from public.forte_legal_term_versions where active for share;
 if p_version is distinct from t.version or p_hash is distinct from t.content_sha256 then raise exception 'O termo foi atualizado. Leia a versão vigente antes de confirmar.' using errcode='40001';end if;
 if (p_source='https://forte-frete.onrender.com') is distinct from true then raise exception 'Origem inválida.';end if;
 insert into public.forte_legal_acceptance_events(user_id,module_key,term_version,content_sha256,evidence_source) values(p_user,private.legal_module(p_app),t.version,t.content_sha256,p_source) on conflict(user_id,module_key,term_version) do nothing;
 select * into strict e from public.forte_legal_acceptance_events where user_id=p_user and module_key=private.legal_module(p_app) and term_version=t.version;
 return to_jsonb(e)||jsonb_build_object('accepted_at',to_char(e.accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end;$$;
create or replace function public.forte_legal_receipts(p_actor uuid,p_target uuid,p_app text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.legal_supported(p_app) then raise exception 'Módulo inválido.';end if;
 if p_actor is distinct from p_target then
 if not private.access_is_admin(p_actor) then raise exception 'Auditoria não autorizada no Frete.' using errcode='42501';end if;
 end if;
 return coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('text',t.content_text,'accepted_at',to_char(e.accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by e.accepted_at desc) from public.forte_legal_acceptance_events e join public.forte_legal_term_versions t on t.version=e.term_version where e.user_id=p_target and e.module_key=private.legal_module(p_app)),'[]'::jsonb);
end;$$;
revoke all on function public.forte_legal_status(uuid,text),public.forte_legal_accept(uuid,text,text,text,boolean,text),public.forte_legal_receipts(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.forte_legal_status(uuid,text),public.forte_legal_accept(uuid,text,text,text,boolean,text),public.forte_legal_receipts(uuid,uuid,text) to service_role;
revoke all on function private.legal_immutable(),private.legal_module(text),private.legal_supported(text) from public,anon,authenticated;
grant execute on function private.legal_module(text),private.legal_supported(text) to service_role;
revoke all on function private.legal_has_current(uuid,text) from public,anon;
grant execute on function private.legal_has_current(uuid,text) to authenticated,service_role;
-- A forged checkbox or direct service-backed submit cannot bypass the database guard.
create or replace function private.legal_registration_guard() returns trigger language plpgsql set search_path='' as $$
declare app text;
begin
 app:=case when tg_table_name in ('registration_dossiers','driver_onboarding','usuarios_app') then 'frete' else to_jsonb(new)->>'app' end;
 if (tg_table_name in ('access_registration_drafts','registration_dossiers','driver_onboarding') and new.status='SUBMITTED') or (tg_table_name='access_requests' and new.status='APROVADO' and old.status is distinct from new.status) then
 if not private.legal_has_current(new.user_id,app) then raise exception 'Aceite pendente do termo vigente neste módulo.' using errcode='42501';end if;
 end if;return new;
end;$$;
do $$declare t text;begin
 foreach t in array array['access_registration_drafts','registration_dossiers','driver_onboarding','access_requests'] loop
 if to_regclass('public.'||t) is not null then execute format('drop trigger if exists legal_registration_guard on public.%I',t);execute format('create trigger legal_registration_guard before update on public.%I for each row execute function private.legal_registration_guard()',t);end if;
 end loop;end;$$;

create or replace function private.access_is_admin(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select private.legal_has_current(p_user,'frete') and exists(select 1 from public.usuarios_app where user_id=p_user and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR'))$$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select private.access_is_admin(auth.uid())$$;
create or replace function private.is_operational() returns boolean language sql stable security definer set search_path='' as $$select private.legal_has_current(auth.uid(),'frete') and exists(select 1 from public.usuarios_app u where u.user_id=auth.uid() and u.ativo and u.status_aprovacao='APROVADO' and not u.trocar_senha and (u.perfil in ('ADMINISTRADOR','MASTER') or (u.perfil='MOTORISTA' and exists(select 1 from public.motoristas m where m.auth_user_id=u.user_id and m.status_cadastro='aprovado'))))$$;
-- Restrictive gates complement existing row ownership; draft/auth/recovery tables remain accessible by their existing paths.
do $$declare t text;begin
 foreach t in array array['cargas','viagens','interesses_carga','integracao_forte_vendas','ordens_carregamento','vendas_ordens','configuracoes','notificacoes_whatsapp','motoristas','veiculos_motorista','motorista_rotas','rotas','favorecidos_frete','chaves_pix_frete','documentos_motorista','documentos_veiculo','historico_motoristas_veiculo','frete_alertas'] loop
 if to_regclass('public.'||t) is not null then execute format('drop policy if exists legal_acceptance_gate on public.%I',t);execute format('create policy legal_acceptance_gate on public.%I as restrictive for all to authenticated using (private.legal_has_current(auth.uid(),''frete'')) with check (private.legal_has_current(auth.uid(),''frete''))',t);end if;
 end loop;end;$$;

do $$begin if to_regclass('storage.objects') is not null then execute 'drop policy if exists legal_acceptance_gate on storage.objects';execute 'create policy legal_acceptance_gate on storage.objects as restrictive for all to authenticated using (bucket_id not in (''motorista-documentos'',''vendas-ordens-frete'',''forte-frete-cadastros'') or private.legal_has_current(auth.uid(),''frete'')) with check (bucket_id not in (''motorista-documentos'',''vendas-ordens-frete'',''forte-frete-cadastros'') or private.legal_has_current(auth.uid(),''frete''))';end if;end;$$;
create or replace function private.legal_frete_profile_guard() returns trigger language plpgsql set search_path='' as $$begin if new.ativo and not old.ativo and not private.legal_has_current(new.user_id,'frete') then raise exception 'Aceite pendente do termo vigente no Frete.' using errcode='42501';end if;return new;end;$$;
drop trigger if exists legal_frete_profile_guard on public.usuarios_app;
create trigger legal_frete_profile_guard before update on public.usuarios_app for each row execute function private.legal_frete_profile_guard();

commit;
