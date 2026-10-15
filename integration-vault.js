const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const providers = {whatsapp:'WhatsApp / Meta',gmail:'Gmail / Google',itau:'Itaú',fiscal:'Serviço fiscal',other:'Outro serviço'};

export async function vaultCall(client, action, data = {}) {
  const result = await client.functions.invoke('integration-vault', {body:{action, ...data}});
  if (result.error) {
    let message = 'Não foi possível acessar o cofre. Confira a sessão e tente novamente.';
    if (result.error.context instanceof Response) {
      try { message = (await result.error.context.clone().json()).error || message; } catch {}
    }
    throw new Error(message);
  }
  return result.data;
}

// The server checks the current profile and live session on every operation.
export function installVaultButton({client, adminBox, onOpen}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fa-vault-button';
  button.textContent = 'COFRE DE INTEGRAÇÕES';
  button.hidden = true;
  adminBox.insertBefore(button, adminBox.querySelector('section'));
  button.onclick = onOpen;
  vaultCall(client, 'STATUS').then(() => { if (button.isConnected) button.hidden = false; }).catch(() => {});
}

export async function renderIntegrationVault({client, host, app, onClose}) {
  host.innerHTML = `<style>
  .forte-vault{max-width:1000px;margin:auto;color:#172b45;white-space:normal;text-align:left}
  .forte-vault form{display:grid;gap:12px;max-width:680px}.forte-vault label{display:grid;gap:4px}
  .forte-vault textarea,.forte-vault input,.forte-vault select{width:100%;box-sizing:border-box;font:16px Arial;text-transform:none;background:#fff;color:#172b45;padding:12px;border:1px solid #b9c6d5;border-radius:8px}
  .forte-vault textarea{-webkit-text-security:disc;min-height:100px}.forte-vault button{min-height:48px;background:#1455a3!important;color:white!important;border:1px solid #1455a3!important;white-space:normal}
  .forte-vault .vault-actions{display:flex;gap:8px;flex-wrap:wrap}.forte-vault article{overflow-wrap:anywhere}
  .forte-vault [role=status]{white-space:pre-wrap}.forte-vault .vault-notice{padding:14px;background:#eef4fc;border-radius:10px;line-height:1.5}
  </style><div class="forte-vault"><div class="vault-actions"><button type="button" data-vault-close>FECHAR COFRE</button><button type="button" data-vault-refresh>ATUALIZAR</button></div>
  <h2>Cofre de integrações</h2><p>Administração exclusiva do Master · ${esc(app)}</p>
  <p class="vault-notice">Guarde tokens, chaves e senhas de serviços. Os valores ficam criptografados no servidor e não são exibidos após salvar. Este cofre pertence a este sistema. Credenciais já configuradas nas integrações continuam nos seus cofres atuais. Guardar aqui não ativa nem altera uma conexão automaticamente.</p>
  <p data-vault-status role="status" aria-live="polite">Conferindo acesso…</p><div data-vault-body hidden>
  <h3 data-vault-title>Adicionar credencial</h3><form data-vault-form autocomplete="off">
  <label>Integração<select name="provider">${Object.entries(providers).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
  <label>Referência da credencial<input name="reference" required pattern="[a-z0-9][a-z0-9_-]{1,63}" minlength="2" maxlength="64" placeholder="Ex.: token_producao" autocapitalize="none" spellcheck="false"></label>
  <label>Nome para identificação<input name="label" required maxlength="100" placeholder="Ex.: WhatsApp de produção"></label>
  <label>Validade (opcional)<input name="expires_at" type="date"></label>
  <label>Valor secreto — token, senha ou conteúdo JSON<input type="password" name="secret" required maxlength="32768" autocomplete="new-password" autocapitalize="none" spellcheck="false" aria-describedby="vault-secret-note"></label>
  <small id="vault-secret-note">Cole somente a credencial desta integração. O campo é limpo após salvar. Não coloque senhas no nome nem na referência.</small>
  <div class="vault-actions"><button type="submit">SALVAR NO COFRE</button><button type="button" data-vault-cancel hidden>CANCELAR SUBSTITUIÇÃO</button></div></form>
  <h3>Credenciais guardadas</h3><div data-vault-list></div><h3>Histórico do cofre</h3><div data-vault-audit></div></div></div>`;
  const form = host.querySelector('[data-vault-form]');
  const output = host.querySelector('[data-vault-status]');
  const body = host.querySelector('[data-vault-body]');
  let entries = [], editing = null, busy = false, closed = false;
  const clear = () => { form.reset(); editing = null; form.elements.provider.disabled = false; form.elements.reference.disabled = false; host.querySelector('[data-vault-title]').textContent = 'Adicionar credencial'; host.querySelector('[data-vault-cancel]').hidden = true; };
  const close = () => { closed = true; form.elements.secret.value = ''; host.innerHTML = ''; onClose?.(); };
  host.querySelector('[data-vault-close]').onclick = close;
  host.querySelector('[data-vault-cancel]').onclick = clear;
  const stamp = value => value ? new Date(value).toLocaleString('pt-BR') : 'Sem validade informada';
  async function refresh() {
    const result = await vaultCall(client, 'LIST');
    if (closed || !host.isConnected) return;
    entries = result.entries || [];
    body.hidden = false;
    host.querySelector('[data-vault-list]').innerHTML = entries.length ? entries.map((entry, i) => `<article><strong>${esc(entry.label)}</strong><p>${esc(providers[entry.provider] || entry.provider)} · ${esc(entry.reference)}<br>Valor: protegido · Versão ${entry.version}<br>Situação: ${entry.archived ? 'Arquivada' : entry.expires_at && Date.parse(entry.expires_at) <= Date.now() ? 'Validade expirada' : 'Guardada — conexão não verificada'}<br>Validade: ${esc(entry.expires_on ? entry.expires_on.split('-').reverse().join('/') : 'Sem validade informada')}<br>Atualização: ${esc(stamp(entry.updated_at))}</p><button type="button" data-vault-edit="${i}" ${entry.archived?'hidden':''}>SUBSTITUIR CREDENCIAL</button><button type="button" data-vault-toggle="${i}">${entry.archived?'RESTAURAR':'ARQUIVAR'}</button></article>`).join('') : '<p>Nenhuma credencial cadastrada neste cofre.</p>';
    const events = {CREATED:'Credencial cadastrada',REPLACED:'Credencial substituída',ARCHIVED:'Credencial arquivada',RESTORED:'Credencial restaurada',LIST:'Cofre consultado',READ_SYSTEM:'Credencial usada no servidor'};
    host.querySelector('[data-vault-audit]').innerHTML = (result.audit || []).map(event=>`<article><strong>${esc(events[event.action]||event.action)}</strong><p>${esc(stamp(event.created_at))}${event.reference?'<br>'+esc(event.reference):''}<br>${event.actor_id?'Master · '+esc(event.actor_id):'Serviço interno'}</p></article>`).join('') || '<p>Nenhum evento registrado.</p>';
    host.querySelectorAll('[data-vault-edit]').forEach(button => button.onclick = () => {
      editing = entries[Number(button.dataset.vaultEdit)]; form.reset();
      for (const key of ['provider','reference','label']) form.elements[key].value = editing[key];
      form.elements.expires_at.value = editing.expires_on || '';
      form.elements.provider.disabled = true; form.elements.reference.disabled = true;
      host.querySelector('[data-vault-title]').textContent = 'Substituir credencial — '+editing.label;
      host.querySelector('[data-vault-cancel]').hidden = false; form.elements.secret.focus();
    });
    host.querySelectorAll('[data-vault-toggle]').forEach(button => button.onclick = () => run(async()=>{
      const entry = entries[Number(button.dataset.vaultToggle)];
      await vaultCall(client, entry.archived?'RESTORE':'ARCHIVE', {id:entry.id,version:entry.version});
      if (editing?.id === entry.id) clear();
      await refresh(); return entry.archived?'Credencial restaurada.':'Credencial arquivada. O valor permanece protegido no cofre.';
    }));
  }
  async function run(work) {
    if (busy || closed) return;
    busy = true; host.querySelectorAll('button').forEach(button=>button.disabled=true);
    output.textContent = 'Aguarde…';
    try { const message = await work(); if (!closed) output.textContent = message; }
    catch { if (!closed) output.textContent = 'Não foi possível concluir. A sessão pode ter expirado ou o registro foi atualizado. Atualize o cofre antes de tentar novamente.'; }
    finally { busy = false; if (!closed) host.querySelectorAll('button').forEach(button=>button.disabled=false); }
  }
  host.querySelector('[data-vault-refresh]').onclick = () => run(async()=>{await refresh(); return 'Cofre atualizado.';});
  form.onsubmit = event => {
    event.preventDefault();
    return run(async()=>{
      const value = form.elements.secret.value;
      try {
        await vaultCall(client, 'SAVE', {
          provider:form.elements.provider.value, reference:form.elements.reference.value,
          label:form.elements.label.value, expires_at:form.elements.expires_at.value || null,
          secret:value, version:editing?.version || 0
        });
        if (closed) return '';
        clear();
        await refresh(); return 'Credencial salva e protegida no cofre. A conexão com o serviço não foi alterada.';
      } finally { form.elements.secret.value = ''; }
    });
  };
  await run(async()=>{await refresh(); return 'Cofre disponível. Somente metadados são exibidos.';});
}
