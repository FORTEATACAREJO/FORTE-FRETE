# FORTE FRETE v5.0

Operação de motoristas, cadastro e aprovação, rotas, cargas de 36–52 t, aceite por capacidade efetiva, integração com Forte Vendas, ordens de carregamento, viagens e pagamentos.

## Cadastro separado (v5.3)

1. Motorista: dados pessoais, contato, endereço, CNH e documentos pessoais.
2. Veículo/conjunto: proprietário, cavalo, carreta 1, dolly e carreta 2, documentos, capacidade e vínculo atual ao motorista.
3. Favorecido: nome, CPF/CNPJ, banco e múltiplas chaves Pix, com uma chave principal por favorecido. O favorecido é vinculado ao veículo.

A ação **Trocar motorista** atualiza somente o vínculo do veículo e registra o histórico. Ela exige administrador e motorista aprovado e bloqueia a troca enquanto houver viagem em andamento. Viagens e ordens anteriores mantêm o motorista e o favorecido registrados na operação. Nenhum cadastro é apagado na substituição.

Schema aplicado em `supabase/separate-registration.sql` e `supabase/pix-key.sql`. A função autenticada `set-password` permite salvar seis números e concluir a liberação do primeiro acesso. A permissão administrativa consulta o perfil ativo no banco, incluindo MASTER em maiúsculas.
