import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://forte-frete.onrender.com", "http://localhost:5173"]);
const genericMessage = "Se o cadastro existir e possuir e-mail, o link para criar uma nova senha será enviado.";
const headers = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://forte-frete.onrender.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  Vary: "Origin",
});

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const responseHeaders = headers(origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  if (request.method !== "POST" || (origin && !allowedOrigins.has(origin))) {
    return Response.json({ error:"REQUISIÇÃO NÃO PERMITIDA." }, { status:403, headers:responseHeaders });
  }
  try {
    const { identificador = "" } = await request.json();
    const normalized = String(identificador).trim().toLowerCase();
    if (!normalized) return Response.json({ message:genericMessage }, { headers:responseHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{ persistSession:false } });
    const byEmail = normalized.includes("@");
    const value = byEmail ? normalized : normalized.replace(/\D/g, "");
    let email = "";
    const users = admin.from("usuarios_app").select("email,ativo").eq("ativo", true);
    const { data:user } = byEmail ? await users.ilike("email", value).maybeSingle() : await users.eq("cpf", value).maybeSingle();
    email = String(user?.email || "").trim().toLowerCase();
    if (!email) {
      const drivers = admin.from("motoristas").select("email");
      const { data:driver } = byEmail ? await drivers.ilike("email", value).maybeSingle() : await drivers.eq("cpf", value).maybeSingle();
      email = String(driver?.email || "").trim().toLowerCase();
    }
    if (email) {
      const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth:{ persistSession:false } });
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo:"https://forte-frete.onrender.com/?recovery=1" });
      if (error) console.error("RECOVERY_SEND_ERROR", error.message);
    }
  } catch (error) {
    console.error("RECOVERY_ERROR", String(error?.message || error));
  }
  return Response.json({ message:genericMessage }, { headers:responseHeaders });
});
