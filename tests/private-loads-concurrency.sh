#!/usr/bin/env bash
set -euo pipefail
: "${PGDATABASE:?Use only a disposable test database}"
if [[ "$PGDATABASE" != forte_test_* ]]; then echo 'A disposable forte_test_* database is required'; exit 1; fi
psql -v ON_ERROR_STOP=1 -f tests/private-loads-fixture.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261016162214_private_load_dispatch.sql
psql -v ON_ERROR_STOP=1 -f tests/private-loads-concurrency.sql
race_dir=$(mktemp -d)
trap 'rm -rf "$race_dir"' EXIT
attempt() {
 psql -v ON_ERROR_STOP=1 -c "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000$1',false); begin;select public.frete_operacao('ACEITAR','00000000-0000-4000-8000-000000000101');select pg_sleep(1);commit;" > "$race_dir/$1.log" 2>&1
}
set +e
attempt 11 & first=$!
attempt 12 & second=$!
wait "$first"; first_status=$?
wait "$second"; second_status=$?
set -e
if [[ "$first_status" == 0 && "$second_status" == 0 ]] || [[ "$first_status" != 0 && "$second_status" != 0 ]]; then cat "$race_dir/11.log" "$race_dir/12.log";exit 1;fi
psql -v ON_ERROR_STOP=1 <<'SQL'
do $$begin
if (select count(*) from viagens)<>1 or (select count(*) from interesses_carga)<>1 or (select count(*) from integracao_forte_vendas)<>1 then raise exception 'Race created inconsistent records';end if;
end$$;
SQL
echo 'PASS: independent concurrent PostgreSQL sessions, one winner, one trip, one interest, one outbox record'
