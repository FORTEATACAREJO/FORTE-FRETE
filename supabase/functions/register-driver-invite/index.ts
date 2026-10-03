import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const origins = new Set(["https://forte-frete.onrender.com", "http://localhost:5173"]);
function validCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(cpf[i]) * (n + 1 - i);
    if ((sum * 10 % 11) % 10 !== Number(cpf[n])) return false;
  }
  return true;
}
function validBirth(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date < new Date() && date.getUTCFullYear() >= 1900;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers = {"Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://forte-frete.onrender.com", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin"};
  const reply = (body: unknown, status = 200) => Response.json(body, {status, headers});
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers});
  if (req.method !== "POST" || !origins.has(origin)) return reply({error: "REQUISIÇÃO NÃO PERMITIDA."}, 403);
  let admin: ReturnType<typeof createClient> | null = null;
  let createdId: string | null = null;
  try {
    const b = await req.json();
    const nome = String(b.nome || "").trim(), cpf = String(b.cpf || "").replace(/\D/g, ""), email = String(b.email || "").trim().toLowerCase(), nascimento = String(b.data_nascimento || "");
    let whatsapp = String(b.whatsapp || "").replace(/\D/g, "");
    if (/^\d{10,11}$/.test(whatsapp)) whatsapp = "55" + whatsapp;
    if (nome.length < 3 || !validCpf(cpf) || !/^55\d{10,11}$/.test(whatsapp) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !validBirth(nascimento) || typeof b.password !== "string" || !/^\d{6,}$/.test(b.password)) {
      return reply({error: "Confira nome, CPF, WhatsApp, e-mail, nascimento e senha numérica com no mínimo 6 dígitos."}, 400);
    }
    const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    admin = createClient(url, key, {auth: {autoRefreshToken: false, persistSession: false}});
    const hkey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", hkey, new TextEncoder().encode(`register:${cpf}:${Math.floor(Date.now() / 60000)}`)));
    const request_key = Array.from(bytes).map(x => x.toString(16).padStart(2, "0")).join("");
    const rate = await admin.from("password_recovery_limits").insert({request_key});
    if (rate.error?.code === "23505") return reply({error: "AGUARDE UM MINUTO ANTES DE TENTAR NOVAMENTE."}, 429);
    if (rate.error) throw new Error("rate_limit");
    let invite: any = null;
    const codigo = String(b.codigo || "").trim();
    if (codigo) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codigo)) return reply({error: "Convite inválido ou encerrado."}, 403);
      const result = await admin.from("convites_motorista").select("id,ativo,uso_ilimitado,total_cadastros").eq("codigo", codigo).eq("ativo", true).maybeSingle();
      if (result.error || !result.data || (!result.data.uso_ilimitado && result.data.total_cadastros > 0)) return reply({error: "Convite inválido ou encerrado."}, 403);
      invite = result.data;
    }
    const existing = await admin.from("usuarios_app").select("user_id").eq("cpf", cpf).maybeSingle();
    if (existing.error) throw new Error("lookup");
    if (existing.data) return reply({error: "CPF já cadastrado. Use a recuperação de senha ou aguarde a aprovação."}, 409);
    const created = await admin.auth.admin.createUser({email, password: b.password, email_confirm: true, user_metadata: {nome, cpf, whatsapp}});
    if (created.error || !created.data.user) return reply({error: "Não foi possível criar o acesso. Confira se o e-mail já está cadastrado."}, 409);
    createdId = created.data.user.id;
    const profile = await admin.from("usuarios_app").insert({user_id: createdId, nome, cpf, whatsapp, email, perfil: "MOTORISTA", ativo: false, status_aprovacao: "PENDENTE", trocar_senha: false});
    if (profile.error) throw new Error("profile");
    const driver = await admin.from("motoristas").insert({auth_user_id: createdId, nome, cpf, telefone: whatsapp, email, data_nascimento: nascimento, status_cadastro: "pre_cadastro"});
    if (driver.error) throw new Error("driver");
    if (invite) {
      const used = await admin.from("convites_motorista").update({total_cadastros: invite.total_cadastros + 1}).eq("id", invite.id).eq("total_cadastros", invite.total_cadastros).select("id");
      if (used.error || !used.data?.length) throw new Error("invite_conflict");
    }
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {auth: {persistSession: false, autoRefreshToken: false}});
    const login = await client.auth.signInWithPassword({email, password: b.password});
    if (login.error || !login.data.session) {
      createdId = null;
      return reply({message: "Pré-cadastro salvo. Entre com CPF e senha para completar o dossiê.", status: "PENDENTE", cadastro_salvo: true});
    }
    createdId = null;
    return reply({access_token: login.data.session.access_token, refresh_token: login.data.session.refresh_token, status: "PENDENTE", message: "Pré-cadastro criado. Complete o dossiê e aguarde aprovação."});
  } catch {
    if (admin && createdId) {
      // Compensate only the records created by this request; never remove an existing account.
      await admin.from("motoristas").delete().eq("auth_user_id", createdId);
      await admin.from("usuarios_app").delete().eq("user_id", createdId);
      await admin.auth.admin.deleteUser(createdId);
    }
    return reply({error: "Não foi possível concluir o cadastro agora. Tente novamente."}, 503);
  }
});
