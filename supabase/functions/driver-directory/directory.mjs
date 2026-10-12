export function directoryRows(drivers){
 return drivers.flatMap(m=>{
  const legacy=m.dados_legados||{};
  const active=m.status_cadastro==='aprovado'||m.status_cadastro==='legado'&&legacy.ativo!==false;
  if(!active)return [];
  const vehicles=(m.veiculos_motorista||[]).filter(v=>v.ativo);
  const primary=vehicles.find(v=>v.conjunto_principal)||vehicles[0];
  return (vehicles.length?vehicles:[null]).map(v=>({
   id:m.origem_vendas_id&&(!v||v===primary)?m.origem_vendas_id:'frete-'+m.id+(v?'-'+v.id:''),
   freteMotoristaId:m.id,freteVeiculoId:v?.id||'',nome:m.nome,cpf:m.cpf||'',telefone:m.telefone||'',
   cnhNumero:m.cnh_registro||'',cnhCategoria:m.categoria_cnh||'',cnhValidade:m.validade_cnh||'',
   rntrc:v?.rntrc||m.rntrc||'',proprietario:v?.proprietario_nome||m.proprietario_nome||'',
   statusCadastro:m.status_cadastro==='aprovado'?'APROVADO':'LEGADO',ativo:true,
   placa1:v?.placa||legacy.placa1||'',placa2:v?.componentes?.[0]?.placa||legacy.placa2||'',
   placa3:v?.componentes?.[1]?.placa||legacy.placa3||'',placa4:v?.componentes?.[2]?.placa||legacy.placa4||'',
   capacidadeMaximaKg:v?Number(v.capacidade_efetiva_t||v.capacidade_t||0)*1000:Number(legacy.capacidadeMaximaKg||legacy.capacidadeAlvoKg||0),
   capacidadeAlvoKg:v?Number(v.capacidade_efetiva_t||v.capacidade_t||0)*1000:Number(legacy.capacidadeAlvoKg||legacy.capacidadeMaximaKg||0),
   origemCadastro:'FORTE FRETE'
  }));
 });
}
export const DRIVER_FIELDS='id,nome,cpf,telefone,cnh_registro,categoria_cnh,validade_cnh,rntrc,proprietario_nome,status_cadastro,origem_vendas_id,dados_legados,veiculos_motorista(id,placa,tipo,capacidade_efetiva_t,capacidade_t,ativo,conjunto_principal,componentes,rntrc,proprietario_nome)';
