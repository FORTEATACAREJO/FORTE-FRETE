# Ciclo de carga entre Forte Frete e Forte Vendas

A carga pode começar pelo pedido ao fornecedor ou pelo aceite de uma oferta pública ou privada no Forte Frete. Não exige vendas de clientes para abrir o dossiê.

## Comportamento desta revisão

- A sincronização dos aceites usa os recibos já validados pelo servidor para abrir uma carga provisória no painel de Cargas. Não inventa fornecedor, pedido oficial, preços nem produtos do cadastro.
- Se já existe uma única carga com motorista, conjunto, rota, peso, produto e quantidade correspondentes, reutiliza essa carga. Correspondências ambíguas continuam para conferência.
- “Preparar pedido deste aceite” abre o formulário do fornecedor. A gravação conserva o ID da carga e valida os dados contra o aceite. O número oficial continua dependendo do fornecedor.
- O envio da ordem revisada gera o PDF no modelo existente. Se houver vendas vinculadas, também gera o romaneio por cliente e endereço, com pedidos, produtos, quantidades, contato e campos para assinatura. Os PDFs do motorista não incluem valores de venda ou custo da compra.
- Ao enviar a ordem de uma carga originada de aceite, vincula o pedido oficial e confirma o retorno ao Frete. O motorista consulta os PDFs na própria viagem, por URLs temporárias e autorização no banco.
- Notas e boletos continuam usando a Central Gmail e o vínculo do pedido/dossiê existentes. Esta revisão não altera a configuração do Gmail nem agenda processamento novo.
- Após validar XML e PDF das notas, libera “Conferir quantidades após as notas” e o anexo do comprovante do frete. A conferência preserva os itens da compra e os arquivos fiscais originais; registra as quantidades operacionais, motivo, responsável e histórico. Aumento acima da compra exige revisão fiscal. Para venda direta, a quantidade conferida deve corresponder às vendas vinculadas.
- Mantém os bloqueios de capacidade máxima e a confirmação Sim/Não quando o conjunto está incompleto.
- A autorização do comprovante de frete permanece exclusiva do Master. O envio existente copia o arquivo para o Frete, com vínculo da carga, pedido e motorista.
- O fechamento de uma carga integrada FOB aguarda a confirmação do hash do comprovante copiado. Mantém as demais verificações de documentos, pallets, destinação e entrega existentes. CIF continua sem exigência de comprovante de frete.

## Implantação e limites

Esta é uma proposta de código para revisão, sem aplicação nos bancos nem publicação em produção.

1. Aplicar no Forte Frete a migração `documentos_motorista_carga`, que adiciona a projeção dos PDFs e sua política de leitura.
2. Publicar a função `vendas-frete-bridge` e o frontend do Forte Frete. A cópia em `integrations/forte-frete` no Vendas deve permanecer idêntica à função do Frete.
3. Publicar `orders-workflow`, `sync-frete-acceptances` e o frontend do Forte Vendas.
4. Homologar oferta pública e privada, aceite sem vendas, preparação do pedido, retorno oficial, PDFs com vários clientes, Gmail real, comprovante validado e fechamento.

A sincronização permanece acionada pelo painel aberto (intervalo existente de 60 segundos) ou pelo botão. Processamento automático com os sistemas fechados depende da fila/agendamento do servidor, fora desta alteração. Após o primeiro envio da ordem ao Frete, vincular/ajustar vendas ou revisar a ordem dispara a atualização dos PDFs. Em caso de falha, mostra pendência e permite reenviar a ordem. Não foi feito envio real para motorista, pagamento, mudança de cadastro nem teste em produção.

## Verificação

- `npm run build`: testes de domínio, integração e regras e compilação do Vendas.
- Testes novos de abertura idempotente do dossiê, fluxo fornecedor primeiro, conferência fiscal preservada, bloqueio de fechamento e PDFs sem preços.
- Forte Frete: build, regressões de aceite/oferta privada e teste PostgreSQL isolado da projeção e política dos PDFs (isolamento entre motoristas, cadastro não aprovado e operação desativada).
- PDF de exemplo renderizado e inspecionado com dois clientes.
- Navegador de testes indisponível; a instalação do Chromium falhou por download inválido. Homologação visual e ponta a ponta permanece pendente.
