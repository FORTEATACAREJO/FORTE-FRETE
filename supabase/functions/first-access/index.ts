Deno.serve(async req=>{
const headers={"Cache-Control":"no-store"};
if(req.method!=="POST"&&req.method!=="OPTIONS")return Response.json({error:"Requisição não permitida."},{status:405,headers});
try{
const body=req.method==="POST"?JSON.stringify({...await req.json(),action:"REGISTER"}):undefined;
return await fetch(Deno.env.get("SUPABASE_URL")+"/functions/v1/access-standard",{method:req.method,headers:{"content-type":"application/json",apikey:Deno.env.get("SUPABASE_ANON_KEY")!,"origin":req.headers.get("origin")||"","x-forwarded-for":req.headers.get("x-forwarded-for")||""},body});
}catch{return Response.json({error:"Não foi possível concluir o cadastro. Use Primeiro cadastro no aplicativo."},{status:503,headers})}
});
