// Authorized sender for the Forte systems. Never accept a different sender from a browser.
export const PHONE_ID = '1278417945364665';
export const WABA_ID = '1081614524680450';
export function fixedSender(phone, waba) {
  if ((phone && String(phone) !== PHONE_ID) || (waba && String(waba) !== WABA_ID)) {
    throw Error('O remetente WhatsApp diverge da configuração autorizada da Forte.');
  }
  return {phone: PHONE_ID, waba: WABA_ID};
}
export function accessToken(value) {
  const token = String(value || '').trim();
  if (token.length < 30 || token.length > 4096 || /\s/.test(token)) {
    throw Error('Informe o token completo da Meta, sem espaços.');
  }
  return token;
}
