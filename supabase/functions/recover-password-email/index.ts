import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set([
  "https://forte-frete.onrender.com",
  "http://localhost:5173",
]);

const genericMessage =
  "Se o cadastro existir e possuir e-mail, o link para criar uma nova senha será enviado.";

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://forte-frete.onrender.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const responseHeaders = headers(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders });
  }

  if (req.method !== "POST" || (origin && !allowedOrigins.has(origin))) {
    return new Response(JSON.stringify({ error: "Requisição não permitida." }), {
      status: 403,
      headers: responseHeaders,
    });
  }

  try {
    const { identificador = "" } = await req.json();
    const normalized = String(identificador).trim().toLowerCase();
    if (!normalized) {
      return new Response(JSON.stringify({ message: genericMessage }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const byEmail = normalized.includes("@");
    const value = byEmail ? normalized : normalized.replace(/\D/g, "");
    let email = "";

    const usuariosQuery = admin.from("usuarios_app").select("email");
    const { data: usuario } = byEmail
      ? await usuariosQuery.ilike("email", value).maybeSingle()
      : await usuariosQuery.eq("cpf", value).maybeSingle();
    email = String(usuario?.email ?? "").trim().toLowerCase();

    if (!email) {
      const motoristasQuery = admin.from("motoristas").select("email");
      const { data: motorista } = byEmail
        ? await motoristasQuery.ilike("email", value).maybeSingle()
        : await motoristasQuery.eq("cpf", value).maybeSingle();
      email = String(motorista?.email ?? "").trim().toLowerCase();
    }

    if (email) {
      const client = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      await client.auth.resetPasswordForEmail(email, {
        redirectTo: "https://forte-frete.onrender.com/",
      });
    }
  } catch {
    // A resposta permanece genérica para não revelar se o cadastro existe.
  }

  return new Response(JSON.stringify({ message: genericMessage }), {
    status: 200,
    headers: responseHeaders,
  });
});
