import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixedSender,accessToken,PHONE_ID,WABA_ID} from '../supabase/functions/_shared/whatsapp-business.mjs';
test('sender IDs are fixed and arbitrary account changes are rejected',()=>{
 assert.deepEqual(fixedSender(),{phone:PHONE_ID,waba:WABA_ID});
 assert.throws(()=>fixedSender('999',WABA_ID));assert.throws(()=>fixedSender(PHONE_ID,'999'));
});
test('tokens are bounded, trimmed and cannot contain whitespace',()=>{
 const token='simulated-token-'.repeat(4);assert.equal(accessToken(' '+token+' '),token);
 for(const value of ['', 'short',token+' internal space','x'.repeat(4097)])assert.throws(()=>accessToken(value));
});
test('configuration UI submits only token and clears it in finally',async()=>{
 const source=await readFile(new URL('../user-invites.js',import.meta.url),'utf8');
 const form=source.slice(source.indexOf('<form id="uiConfigForm">'),source.indexOf('</form></details>'));
 assert(!/name="(?:phone_id|waba_id)"/.test(form));assert.match(form,/name="token" type="password"/);
 assert.match(source,/finally\{configForm.elements.token.value='';button.disabled=false/);
});
