# JADE-MT — Contexto e Regras Estritas (Estagiário 2: GIS / Oráculo Ambiental)

## 1. Visão Geral e Arquitetura Atual

Você está atuando na consolidação da PoC geoespacial reproduzível do JADE-MT (baseada nos PRs #29 e #30 já na `master`).

- **Fluxo de Dados:** `geometry → source → events → PostGIS → rule → ValidationResult`
- **Stack:** Monorepo TypeScript (`pnpm`), Node.js, PostgreSQL + PostGIS (GEOS/PROJ).
- **Escopo de Diretórios:**
  - `packages/environmental-oracle/`
  - `packages/database/`
  - `apps/api/`
  - `scripts/verify-environmental-api.ts`
  - `scripts/replay-environmental-api.ts`

## 2. Regras de Ouro (Invioláveis)

- **NÃO reimplemente o que já funciona:** Não crie outro projeto de geoprocessamento nem reestruture o banco ou migrations já aplicadas.
- **Integridade de Hashes (PR #30):** Os hashes são calculados sobre os **bytes brutos da resposta antes da decodificação**. NUNCA recalcule hashes fazendo parsing/reformatação JSON ou round-trip de texto.
- **Metodologia em DRAFT (`JADE-ENV-0.1`):** A execução padrão da API DEVE continuar retornando `INCONCLUSIVE`. Para testar a proposta de decisão (`PASS`, `FAIL`, `INCONCLUSIVE`), use exclusivamente a injeção explícita de `evaluateDecisionProposal` nos testes controlados. NUNCA crie flags de request ou variáveis de ambiente que simulem aprovação na API.
- **Rigor Semântico Temporal:** NUNCA reclassifique `view_date`, `image_date` ou `year` de capturas reais como data exata de ocorrência apenas para forçar um resultado `PASS` ou `FAIL`.
- **Rigor Espacial e Agregação:**
  - Geometria inválida gera `issue` e medição ausente (NUNCA fabrique área `0`).
  - Não some áreas de eventos sobrepostos como se fossem uma união (`null` enquanto não houver política aprovada).
  - Falha em uma fonte (PRODES ou DETER) deve gerar erro operacional (D3), nunca substituir silenciosamente o resultado pela outra fonte.
- **Política de Dados (`.data/`):** Capturas brutas ficam fora do Git. Testes automatizados devem usar fixtures sintéticas pequenas e versionadas.

## 3. Fora de Escopo (Proibido nesta etapa)

- Implementar contratos Stellar/Soroban, cliente Web3, autenticação de validator ou TTL.
- Criar novos endpoints de manifesto na API.
- Criar sistemas complexos de observabilidade (apenas instrumentação mínima de tempo nos scripts de pesquisa).
