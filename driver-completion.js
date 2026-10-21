const digits=value=>String(value||'').replace(/\D/g,'');
export function validCompletionCpf(value){
 const cpf=digits(value);if(!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf))return false;
 for(const n of [9,10]){let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);if((sum*10%11)%10!==Number(cpf[n]))return false;}return true;
}
export function completionInviteProblem(driver){
 if(driver.auth_user_id)return 'Este motorista já tem acesso. Ele pode entrar com CPF e senha para acompanhar o cadastro.';
 if(!['legado','pre_cadastro','pendencia','reprovado'].includes(driver.status_cadastro))return 'Este cadastro não está disponível para complementação por convite.';
 if(!validCompletionCpf(driver.cpf))return 'Confira e salve um CPF válido antes de enviar o convite.';
 if(!/^(?:55)?[1-9]\d[2-9]\d{7,8}$/.test(digits(driver.telefone)))return 'Confira e salve o WhatsApp com DDD antes de enviar o convite.';
 return '';
}
export function completionIssues(driver){
 if(driver.status_cadastro==='aprovado')return [];
 const issues=driver.dados_legados?.pendenciasCadastro;
 return Array.isArray(issues)?issues.filter(x=>typeof x==='string'&&!/^(e-?mail|nome do proprietário|whatsapp do proprietário)$/i.test(x.trim())):[];
}
export function fillCompletionForm(form,data={}){
 for(const [key,value]of Object.entries(data)){
  if(key==='plates'){for(const part of ['carreta_1','dolly','carreta_2']){const input=form.elements['plate_'+part];if(input&&!input.value&&typeof value?.[part]==='string')input.value=value[part];}continue;}
  if(['files','declaracao','absent','password','confirm','nome','cpf','data_nascimento','email','whatsapp'].includes(key))continue;
  const input=form.elements[key];if(!input||!['string','number'].includes(typeof value))continue;
  if(!input.value)input.value=String(value);
 }
}
