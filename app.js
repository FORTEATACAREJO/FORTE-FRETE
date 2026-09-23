import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const s=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const q=x=>document.querySelector(x), qa=x=>document.querySelectorAll(x);
const auth=q('#auth'),home=q('#home'),pre=q('#pre'),e=q('#email'),p=q('#senha'),st=q('#st'),painel=q('#painel');
e.value=localStorage.getItem('forte_frete_email')||'';
function show(which){[auth,home,pre].forEach(x=>x.classList.add('hidden'));which.classList.remove('hidden')}
async function logged(session){if(!session)return show(auth);q('#usuario').textContent=session.user.email||session.user.phone||'Usuário autenticado';show(home)}
q('#entrar').onclick=async()=>{st.textContent='Entrando...';const {data,error}=await s.auth.signInWithPassword({email:e.value.trim(),password:p.value});if(error){st.textContent='Falha no acesso: '+error.message;return}localStorage.setItem('forte_frete_email',e.value.trim());p.value='';st.textContent='Acesso seguro.';logged(data.session)};
q('#sair').onclick=async()=>{await s.auth.signOut();show(auth)};
q('#cadastro').onclick=()=>show(pre);qa('.voltar').forEach(b=>b.onclick=()=>show(auth));
q('#esqueci').onclick=async()=>{const email=e.value.trim();if(!email){st.textContent='Digite seu e-mail para recuperar a senha.';return}const {error}=await s.auth.resetPasswordForEmail(email,{redirectTo:location.origin});st.textContent=error?'Não foi possível enviar: '+error.message:'Enviamos as instruções de recuperação para '+email+'.'};
qa('[data-canal]').forEach(b=>b.onclick=()=>{const tel=q('#telefone').value.trim(),mail=q('#preemail').value.trim();if(!tel){alert('Informe primeiro o celular com DDD.');return}if(b.dataset.canal==='email'&&!mail){alert('Informe um e-mail para escolher esta opção.');return}alert('Canal '+b.dataset.canal.toUpperCase()+' preparado. A ativação do envio real do token depende da configuração do provedor de mensagens.');});
const views={
motoristas:['Motoristas','Cadastros e aprovação dos motoristas serão exibidos aqui.'],
rotas:['Rotas e cargas','Cadastro das rotas oficiais, cargas publicadas e compatibilidade por capacidade.'],
documentos:['Documentos','Conferência de CNH, cavalo, carreta 1, Dolly, carreta 2 e foto do conjunto.'],
viagens:['Viagens','Histórico de viagens com rota, peso, veículo confirmado e frete.'],
seguranca:['Segurança','Dados protegidos por autenticação, RLS e armazenamento privado.']
};
qa('[data-view]').forEach(b=>b.onclick=()=>{const v=views[b.dataset.view];painel.innerHTML='<h2>'+v[0]+'</h2><p>'+v[1]+'</p><div class="notice">Módulo aberto. As operações completas serão liberadas conforme a integração de cada fluxo com o banco.</div>';painel.classList.remove('hidden');painel.scrollIntoView({behavior:'smooth'})});
const {data:{session}}=await s.auth.getSession();logged(session);
s.auth.onAuthStateChange((_event,session)=>logged(session));