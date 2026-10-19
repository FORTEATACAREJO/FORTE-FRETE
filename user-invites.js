export function businessStatusText(c) {
 if(c.credential_status==='TOKEN_REJECTED')return 'A Meta recusou o token cadastrado (código 190). O master deve configurar um token válido para enviar pelo Business.';
 if(!c.business_credentials)return 'Envio pelo Business depende da configuração das credenciais. O link já pode ser compartilhado pelo WhatsApp.';
 if(c.credential_status!=='VALID')return 'Credenciais salvas, mas a validação com a Meta não foi confirmada. Confira o status antes de enviar.';
 if(c.template_status==='APPROVED')return 'WhatsApp Business pronto para enviar os convites pelo botão.';
 if(!c.template_configured||['NOT_CONFIGURED','NOT_FOUND'].includes(c.template_status))return 'Token verificado. O modelo de convite ainda não foi encontrado na Meta. Configure o Business para criar o modelo; o envio depende da aprovação.';
 if(c.template_status==='UNVERIFIED')return 'Token verificado. Não foi possível consultar o modelo; confira a permissão de gerenciamento do WhatsApp Business.';
 if(c.template_status==='REJECTED')return 'Token verificado. A Meta reprovou o modelo de convite. Confira os motivos no Gerenciador do WhatsApp antes de enviar.';
 return 'Token verificado. Modelo ainda não liberado para envio. Situação: '+c.template_status;
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function inviteCall(client,app,action,data={}){const r=await client.functions.invoke('access-invites',{body:{app,action,...data}});if(r.error){let message='Não foi possível concluir o convite.';if(r.error.context instanceof Response){try{message=(await r.error.context.clone().json()).error||message}catch{}}throw Error(message)}return r.data;}
// Parse only the contact explicitly shared by the user.
export function copiedWhatsAppContact(value){
 const text=String(value||'').trim();if(!text||text.length>4096)return {phones:[]};
 let candidates=[],name='';
 if(/^BEGIN:VCARD\s*$/im.test(text)){
  candidates=[...text.matchAll(/^TEL[^:\r\n]*:(?:tel:)?([^\r\n]+)/gim)].map(m=>m[1]);
  name=(text.match(/^FN(?:;[^:\r\n]*)?:([^\r\n]+)/im)?.[1]||'').replace(/\\[nN]/g,' ').replace(/\\([,;\\])/g,'$1').trim().slice(0,100);
 }else if(/^https?:\/\//i.test(text)){
  try{const u=new URL(text);if(u.hostname==='wa.me')candidates=[u.pathname.slice(1)];else if(['api.whatsapp.com','web.whatsapp.com','www.whatsapp.com','whatsapp.com'].includes(u.hostname)&&u.pathname==='/send')candidates=[u.searchParams.get('phone')||''];}catch{}
 }else{
  candidates=text.match(/\+?\d(?:[\d \t().-]*\d)?/g)||[];
  const first=text.split(/\r?\n/)[0];if(!/\d/.test(first)&&text.includes('\n'))name=first.trim().slice(0,100);
 }
 const phones=[];const seen=new Set();
 for(const c of candidates){const phone=c.replace(/[^0-9]/g,'');if(!/^(?:55)?[1-9][0-9][2-9][0-9]{7,8}$/.test(phone))continue;const key=phone.length>11?phone.slice(2):phone;if(!seen.has(key)){seen.add(key);phones.push(phone);}}
 return {phones,name};
}
export async function pasteInvitePhone(input,status,clipboard=globalThis.navigator?.clipboard,nameInput){
 const manual=()=>{status.textContent='Digite o WhatsApp com DDD ou toque no campo e escolha Colar.';input.focus();};
 if(!clipboard?.readText){manual();return;}
 try{
  const contact=copiedWhatsAppContact(await clipboard.readText());
  if(contact.phones.length!==1){status.textContent=contact.phones.length?'O contato tem mais de um número. Copie somente o WhatsApp que deseja convidar.':'Não encontrei um número com DDD no contato copiado. Digite ou cole o WhatsApp.';input.focus();return;}
  input.value=contact.phones[0];input.dispatchEvent(new Event('input',{bubbles:true}));
  if(nameInput&&!nameInput.value.trim()&&contact.name){nameInput.value=contact.name;nameInput.dispatchEvent(new Event('input',{bubbles:true}));}
  input.focus();status.textContent='Contato colado. Confira o WhatsApp antes de enviar o convite.';
 }catch{manual();}
}
export function showInviteContact(input,nameInput,status,choices,contact){
 const apply=phone=>{input.value=phone;input.dispatchEvent(new Event('input',{bubbles:true}));if(contact.name){nameInput.value=contact.name;nameInput.dispatchEvent(new Event('input',{bubbles:true}));}status.textContent='Contato selecionado. Confira o WhatsApp e envie o convite.';choices.innerHTML='';};
 choices.innerHTML='';
 if(!contact.phones.length){status.textContent='Contato sem número válido com DDD. Escolha outro contato ou informe o WhatsApp.';return;}
 if(contact.phones.length===1){apply(contact.phones[0]);return;}
 status.textContent='Escolha qual número deste contato usa WhatsApp.';
 choices.innerHTML=`<label>WhatsApp do contato<select aria-label="WhatsApp do contato"><option value="">Selecione o número</option>${contact.phones.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></label>`;
 choices.querySelector('select').onchange=e=>{if(contact.phones.includes(e.target.value))apply(e.target.value);};
}
export async function selectInviteContact({input,nameInput,status,choices,navigator:nav=globalThis.navigator,storage}){
 const marker='forte-contact-picker-pending';let marked=false;
 if(storage===undefined)try{storage=globalThis.sessionStorage;}catch{}
 try{
  if(!nav?.contacts?.select){status.textContent='Este navegador não abre a agenda. Use IMPORTAR CONTATO (.VCF), copie o número ou abra o site no Chrome.';return;}
  try{if(storage?.getItem(marker)){status.textContent='A última abertura da agenda não terminou. Use IMPORTAR CONTATO (.VCF) para evitar repetir o fechamento do Chrome.';return;}storage?.setItem(marker,'1');marked=true;}catch{}
  // Call select directly in the click handler, while the user gesture is active.
  const contacts=await nav.contacts.select(['name','tel'],{multiple:false});
  const c=contacts?.[0];if(!c){status.textContent='Nenhum contato selecionado.';return;}
  const phones=copiedWhatsAppContact((c.tel||[]).join('\n')).phones;
  showInviteContact(input,nameInput,status,choices,{phones,name:c.name?.[0]||''});
 }catch(e){status.textContent=e?.name==='AbortError'?'Seleção cancelada.':'Não foi possível abrir a agenda. Use IMPORTAR CONTATO (.VCF) ou informe o WhatsApp.';}
 finally{if(marked)try{storage?.removeItem(marker);}catch{}}
}
export async function importInviteContact(file,fields){
 if(!file)return;
 if(file.size>4096){fields.status.textContent='Exporte somente um contato em arquivo .VCF de até 4 KB, sem foto.';return;}
 try{const text=await file.text();if((text.match(/^BEGIN:VCARD\s*$/gim)||[]).length!==1){fields.status.textContent='Escolha um arquivo .VCF com somente um contato.';return;}
 showInviteContact(fields.input,fields.nameInput,fields.status,fields.choices,copiedWhatsAppContact(text));
 }catch{fields.status.textContent='Não foi possível ler o contato. Escolha um arquivo .VCF válido.';}
}
export async function renderUserInvites({client,app,host,referral=false,onClose}){
 host.innerHTML=`<style>.forte-invite-form{display:grid;gap:12px;max-width:720px}.forte-invite-form label{display:grid;gap:6px}.forte-invite-actions{position:sticky;bottom:0;z-index:6;display:flex;flex-wrap:wrap;gap:8px;padding:12px 0;background:#fff}.forte-invite-actions button{display:block!important;min-height:48px;flex:1 1 180px;background:#1455a3;color:#fff;border:0;border-radius:10px;padding:12px;font-weight:bold}.forte-invite-form input{box-sizing:border-box;max-width:100%;min-height:44px}.forte-invite-form input[type=checkbox]{min-height:24px}#uiMessage{white-space:pre-wrap;overflow-wrap:anywhere}</style><nav style="display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:var(--surface,#fff);padding:10px;z-index:5"><button type="button" id="uiBack">VOLTAR</button><button type="button" id="uiExit">FECHAR</button></nav><h2>${referral?'Indicar motorista ou amigo':'Convidar usuário'}</h2>${onClose?'<button id="uiClose">FECHAR</button>':''}<form id="uiForm" class="forte-invite-form"><p>Convite para ${esc(({frete:"Forte Frete",vendas:"Forte Vendas",fiscal:"Forte Fiscal"})[app]||app)}. Digite o WhatsApp e envie o convite. ${app==='frete'?'O cadastro de motorista é feito uma única vez no Forte Frete e, após aprovação, também é usado pelo Forte Vendas. ':''}A pessoa cria o acesso com CPF, nome, nascimento, e-mail opcional e senha. A administração escolhe o perfil na aprovação.</p><button id="uiSearchContact" type="button">BUSCAR CONTATO NA AGENDA</button><label>IMPORTAR CONTATO (.VCF)<input id="uiContactFile" type="file" accept=".vcf,text/vcard,text/x-vcard"></label><p>Selecione na agenda o contato que usa WhatsApp. Se a agenda fechar o Chrome, importe um contato .VCF exportado da agenda.</p><button id="uiContact" type="button">COLAR NÚMERO DO WHATSAPP</button><p id="uiContactStatus" role="status">Aceita número, contato copiado ou link do WhatsApp. Confira o número com DDD antes de enviar.</p><div id="uiContactChoices"></div><label>Nome (opcional)<input name="nome" autocomplete="name"></label><label>WhatsApp com DDD<input name="whatsapp" type="tel" required autocomplete="tel"></label><label style="display:flex;gap:8px;align-items:center"><input id="uiConsent" type="checkbox" required style="width:auto"> O convidado autorizou receber a mensagem.</label><div class="forte-invite-actions"><button id="uiSend" type="submit">ENVIAR CONVITE</button><button id="uiSync" type="button">SINCRONIZAR</button></div></form><section id="uiResult" hidden></section><p id="uiMessage" role="status"></p><p id="uiBusinessStatus"></p><details id="uiConfig" hidden><summary>Configurar WhatsApp Business para os sistemas</summary><form id="uiConfigForm"><p>O master verifica as credenciais e configura o mesmo remetente para os convites de todos os sistemas. O token fica no cofre.</p><label>ID do número<input name="phone_id" value="1278417945364665" required inputmode="numeric"></label><label>ID da conta Business<input name="waba_id" value="1081614524680450" required inputmode="numeric"></label><label>Token de acesso da Meta<input name="token" type="password" required autocomplete="off"></label><button type="submit">VERIFICAR E CONFIGURAR BUSINESS</button><p role="status" id="uiConfigMessage"></p></form></details><section id="uiRegistrations" aria-live="polite"></section><h3>Meus convites</h3><div id="uiHistory"></div>`;
 const form=host.querySelector('#uiForm'),message=host.querySelector('#uiMessage'),result=host.querySelector('#uiResult');let current;let sending=false;
 const closeInvites=()=>{if(typeof onClose==='function')onClose();else {host.innerHTML='';}};host.querySelector('#uiBack').onclick=closeInvites;host.querySelector('#uiExit').onclick=closeInvites;if(onClose)host.querySelector('#uiClose').onclick=onClose;
 const contactStatus=host.querySelector('#uiContactStatus'),pasteButton=host.querySelector('#uiContact');
 pasteButton.onclick=async()=>{if(pasteButton.disabled)return;pasteButton.disabled=true;try{await pasteInvitePhone(form.elements.whatsapp,contactStatus,globalThis.navigator?.clipboard,form.elements.nome);}finally{pasteButton.disabled=false;}};
 const fields={input:form.elements.whatsapp,nameInput:form.elements.nome,status:contactStatus,choices:host.querySelector('#uiContactChoices')};
 const search=host.querySelector('#uiSearchContact');search.onclick=async()=>{if(search.disabled)return;search.disabled=true;try{await selectInviteContact(fields);}finally{search.disabled=false;}};
 host.querySelector('#uiContactFile').onchange=async e=>{await importInviteContact(e.target.files?.[0],fields);e.target.value='';};
 const show=i=>{current=i;const target=i.link||i.target_url||location.origin+location.pathname+'?cadastro=convite&convite=1&codigo='+i.token;const text='A Forte Atacarejo convida você a criar seu acesso. O perfil será definido pela administração. Cadastre-se aqui: '+target;result.hidden=false;result.innerHTML=`<h3>Link do convite</h3><input id="uiLink" readonly value="${esc(target)}" style="width:100%;box-sizing:border-box"><button id="uiCopy">COPIAR LINK</button><a style="display:inline-block;margin:8px" href="https://wa.me/${esc(i.recipient_phone||'')}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">ABRIR WHATSAPP</a><button id="uiSendAgain">ENVIAR ESTE CONVITE PELO BUSINESS</button>`;result.querySelector('#uiCopy').onclick=async()=>{try{await navigator.clipboard.writeText(target);message.textContent='Link copiado.';}catch{result.querySelector('input').select();message.textContent='Selecione e copie o link.'}};result.querySelector('#uiSendAgain').onclick=async e=>{e.target.disabled=true;try{if(!host.querySelector('#uiConsent').checked)throw Error('Confirme a autorização do convidado para receber a mensagem.');const r=await inviteCall(client,app,'SEND',{id:current.id,opt_in:true});message.textContent=r.message;await history();}catch(e){message.textContent=e.message;}finally{e.target.disabled=false;}};};
 const history=async()=>{const r=await inviteCall(client,app,'LIST');host.querySelector('#uiConfig').hidden=!r.can_configure;host.querySelector('#uiHistory').innerHTML=r.invites.map(i=>`<article><strong>${esc(i.recipient_name||'Convidado')}</strong><p>${esc(i.recipient_phone)} · ${esc(({CREATED:'Link criado',SENDING:'Envio em andamento',ACCEPTED_BY_META:'Aceito pela Meta para envio',FAILED:'Envio bloqueado ou recusado',UNCERTAIN:'Resultado do envio pendente'})[i.status])}<br>${esc(i.error_message||'')}<br>${i.claimed_at?'Cadastro vinculado':'Aguardando cadastro'}</p><button data-invite-id="${i.id}">ABRIR CONVITE</button></article>`).join('')||'<p>Nenhum convite criado.</p>';host.querySelectorAll('[data-invite-id]').forEach(b=>b.onclick=()=>show(r.invites.find(i=>i.id===b.dataset.inviteId)));};
 form.onsubmit=async e=>{e.preventDefault();if(sending)return;sending=true;const button=form.querySelector('[type="submit"]');button.disabled=true;message.textContent='Criando e enviando convite…';try{const consent=host.querySelector('#uiConsent').checked;if(!consent)throw Error('Confirme a autorização do convidado.');const data=Object.fromEntries(new FormData(form));const i=await inviteCall(client,app,'INVITE',data);show(i);try{const sent=await inviteCall(client,app,'SEND',{id:i.id,opt_in:consent});message.textContent=sent.message;}catch(e){message.textContent='Link criado. '+e.message;}await history();}catch(e){message.textContent=e.message;}finally{sending=false;button.disabled=false;}};
 const syncButton=host.querySelector("#uiSync");syncButton.onclick=async()=>{syncButton.disabled=true;message.textContent="Sincronizando convites e cadastros salvos…";try{await history();await capabilities();if(!referral){await syncRegistrations(client,app,host);message.textContent="Sincronização concluída. Para retomar um cadastro incompleto, o convidado deve entrar com o CPF e a senha já criados.";}else message.textContent="Convites atualizados. Nenhuma mensagem foi reenviada.";}catch(e){message.textContent=e.message;}finally{syncButton.disabled=false;}};
 const configForm=host.querySelector('#uiConfigForm');configForm.onsubmit=async e=>{e.preventDefault();const button=configForm.querySelector('button'),status=host.querySelector('#uiConfigMessage');button.disabled=true;try{const r=await inviteCall(client,app,'CONFIGURE',Object.fromEntries(new FormData(configForm)));configForm.elements.token.value='';status.textContent=r.message;await capabilities();}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
 const capabilities=async()=>{const c=await inviteCall(client,app,'CAPABILITIES');host.querySelector('#uiBusinessStatus').textContent=businessStatusText(c);};
 try{await history();await capabilities();}catch(e){message.textContent=e.message;}
}

async function syncRegistrations(client,app,host){
 const q=await client.functions.invoke('access-standard',{body:{app,action:'QUEUE'}});
 if(q.error)throw Error('Convites atualizados, mas não foi possível consultar a fila de cadastros.');
 const pending=q.data.pending||[];let drivers=[];
 if(app==='frete'){
  const r=await client.from('motoristas').select('id,nome,status_cadastro').in('status_cadastro',['pre_cadastro','pendencia','em_analise']).order('nome');
  if(r.error)throw Error('Convites e fila atualizados, mas não foi possível consultar os motoristas incompletos.');
  drivers=r.data||[];
 }
 host.querySelector('#uiRegistrations').innerHTML='<h3>Cadastros salvos</h3>'+pending.map(x=>'<article><strong>'+esc(x.nome)+'</strong><p>Aguardando análise de acesso</p></article>').join('')+drivers.map(x=>'<article><strong>'+esc(x.nome)+'</strong><p>'+esc(({pre_cadastro:'Cadastro incompleto — aguarda documentos',pendencia:'Cadastro com pendência',em_analise:'Documentos enviados para análise'})[x.status_cadastro])+'</p></article>').join('')+(!pending.length&&!drivers.length?'<p>Nenhum cadastro pendente encontrado.</p>':'');
}
