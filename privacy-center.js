import{createClient}from'https://esm.sh/@supabase/supabase-js@2.116.0';
import{SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY}from'./config.js';
const form=document.querySelector('#requestForm'),login=document.querySelector('#privacyLogin'),notice=document.querySelector('#notice'),list=document.querySelector('#requests');
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const kind=document.body.dataset.kind;
async function load(){
 const result=await client.auth.getSession();const session=result.data.session;
 login.hidden=Boolean(session);form.hidden=!session;
 list.replaceChildren();
 if(!session){notice.textContent='Entre com seu CPF e senha para identificar sua conta e enviar a solicitação.';return}
 notice.textContent='Sessão identificada. Você pode enviar sua solicitação abaixo.';
 const tickets=await client.from('frete_atendimento').select('id,tipo,status,resposta,created_at').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(30);
 if(tickets.error){notice.textContent='Não foi possível consultar o atendimento. Tente novamente mais tarde.';return}
 for(const ticket of tickets.data||[]){const item=document.createElement('p');item.textContent=`Protocolo ${ticket.id} — ${ticket.tipo} — ${ticket.status}. ${ticket.resposta||'Aguardando atendimento.'}`;list.append(item)}
}
login.onsubmit=async e=>{e.preventDefault();const button=login.querySelector('button');button.disabled=true;notice.textContent='Identificando sua conta...';try{
 const r=await client.functions.invoke('access-standard',{body:{action:'LOGIN',app:'frete',cpf:login.elements.cpf.value.replace(/\D/g,''),password:login.elements.password.value}});
 if(r.error||!r.data?.access_token)throw Error('Não foi possível entrar. Confira CPF e senha. Se perdeu a senha, use a recuperação no aplicativo.');
 const auth=await client.auth.setSession({access_token:r.data.access_token,refresh_token:r.data.refresh_token});if(auth.error)throw auth.error;login.reset();await load();
}catch{notice.textContent='Não foi possível entrar. Confira CPF e senha ou use a recuperação de acesso no aplicativo.';}finally{button.disabled=false}};
form.onsubmit=async e=>{e.preventDefault();if(kind==='EXCLUSAO'&&!form.elements.confirm.checked)return;const button=form.querySelector('button');button.disabled=true;notice.textContent='Registrando...';try{
 const mensagem=kind==='EXCLUSAO'?'Solicito a exclusão da minha conta do Forte Frete e dos dados associados. Entendo que registros sujeitos a retenção necessária serão informados no atendimento.':form.elements.mensagem.value.trim();
 if(!mensagem)throw Error();
 const r=await client.from('frete_atendimento').insert({tipo:kind,mensagem}).select('id').single();
 if(r.error){notice.textContent=r.error.code==='23505'?'Você já possui uma solicitação de exclusão em aberto. Consulte o protocolo abaixo.':'Não foi possível registrar. Nenhuma confirmação de envio foi recebida; tente novamente.';return}
 await load();notice.textContent=`Solicitação registrada. Protocolo ${r.data.id}. ${kind==='EXCLUSAO'?'A exclusão ainda será processada; acompanhe o resultado nesta página.':'Acompanhe a resposta nesta página.'}`;form.reset();
}catch{notice.textContent='Não foi possível registrar. Tente novamente.';}finally{button.disabled=false}};
load().catch(()=>notice.textContent='Atendimento temporariamente indisponível. Tente novamente mais tarde.');
