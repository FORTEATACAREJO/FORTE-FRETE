export const projects = {
  gtwecfyffjszghnvtlzr:['https://forte-vendas.onrender.com','https://forte-vendas-app.onrender.com','https://forte-venda-externa.onrender.com','https://forte-financeiro.onrender.com','https://forte-carga-direta.onrender.com','https://forte-patio.onrender.com','https://site-forte-atacarejo.onrender.com'],
  nkynfboqwfxhhxcsrawl:['https://forte-frete.onrender.com'],
  xmfpvvmvdkepmnvtdoio:['https://forte-fiscal.onrender.com']
};
export function isVaultMaster(profile) {
  return Boolean(profile && (profile.active ?? profile.ativo) === true &&
    (!profile.status_aprovacao || profile.status_aprovacao === 'APROVADO') &&
    !profile.must_change_password && !profile.trocar_senha &&
    ['MASTER','ULTRA_ADMIN'].includes(profile.role || profile.perfil));
}
export function validateCommand(body) {
  if (!body || !['STATUS','LIST','SAVE','ARCHIVE','RESTORE'].includes(body.action)) throw Error('Ação inválida.');
  if (body.action === 'SAVE') {
    if (!['whatsapp','gmail','itau','fiscal','other'].includes(body.provider) ||
        typeof body.reference !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(body.reference) ||
        typeof body.label !== 'string' || !body.label.trim() || body.label.trim().length > 100 ||
        typeof body.secret !== 'string' || !body.secret.trim() || body.secret.length > 32768 ||
        !Number.isInteger(body.version) || body.version < 0 ||
        body.expires_at != null && (typeof body.expires_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.expires_at) || Number.isNaN(Date.parse(body.expires_at)))) throw Error('Confira referência, nome, validade e credencial.');
    return {provider:body.provider,reference:body.reference,label:body.label.trim(),secret:body.secret,version:body.version,expires_at:body.expires_at || null};
  }
  if (['ARCHIVE','RESTORE'].includes(body.action)) {
    if (typeof body.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(body.id) || !Number.isInteger(body.version) || body.version < 1) throw Error('Registro inválido.');
    return {id:body.id,version:body.version};
  }
  return {};
}
