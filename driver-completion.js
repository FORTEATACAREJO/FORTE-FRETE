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

// Pendências atuais são recalculadas; aprovação não esconde campos ausentes ou CNH vencida.
export function currentDriverIssues(driver,documents=[],today=new Date().toISOString().slice(0,10)){
 const missing=[];
 const required=[['nome','Nome completo'],['cpf','CPF'],['telefone','WhatsApp com DDD'],['data_nascimento','Data de nascimento'],['cnh_registro','Registro da CNH'],['categoria_cnh','Categoria da CNH'],['validade_cnh','Validade da CNH'],['cep','CEP'],['endereco','Endereço'],['numero','Número do endereço'],['bairro','Bairro'],['cidade_uf','Cidade/UF'],['contato_emergencia','Contato de emergência'],['contato_emergencia_telefone','Telefone de emergência']];
 for(const [key,label] of required)if(!String(driver[key]||'').trim())missing.push(label);
 if(driver.cpf&&!validCompletionCpf(driver.cpf))missing.push('CPF inválido');
 if(driver.telefone&&!/^(?:55)?[1-9]\d[2-9]\d{7,8}$/.test(digits(driver.telefone)))missing.push('WhatsApp inválido');
 if(driver.validade_cnh&&driver.validade_cnh<today)missing.push('CNH vencida');
 for(const [type,label]of [['cnh_frente','CNH frente'],['cnh_verso','CNH verso']])if(!documents.some(d=>d.motorista_id===driver.id&&d.tipo===type&&d.arquivo_path&&!['rejeitado','reprovado','vencido'].includes(String(d.status||'').toLowerCase())))missing.push(label+' — documento para conferir/anexar');
 if(driver.status_cadastro==='pendencia'&&driver.observacoes)missing.push('Correção solicitada: '+driver.observacoes);
 return [...new Set(missing)];
}
export function driverCompletionMessage(driver,issues){return 'Olá, '+driver.nome+'. Seu cadastro na Forte Atacarejo tem pendências: '+issues.join('; ')+'. Entre com seu CPF e senha e complete os dados: https://forte-frete.onrender.com/';}
