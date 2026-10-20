---
name: semana-3-evidence-handoff
description: Valida persistência POST/GET após reinício e gera o documento oracle-evidence-handoff-v01.md
---

Estamos na **Atividade 3: Demonstrar persistência e preparar saída para Evidence**.

Preciso validar o comportamento de `POST /validations` e `GET /validations/:validationId` em `apps/api/` e `packages/database/`, garantindo que:

- O `GET` após reinício retorna o histórico persistido sem consultar WFS.
- Medições são associadas por ID do evento (independente da ordem de arrays).
- Falhas na persistência nunca retornam HTTP 200 e execuções falhas ficam registradas como `failed` com evidências.

Em seguida, gere o conteúdo completo para `docs/research/oracle-evidence-handoff-v01.md` (alinhado a `docs/research/evidence-manifest-v01.md` e `evidence-hashing.md`), incluindo:

1. Exemplo pequeno e versionado de saída (input, resultado, receipts).
2. Tabela de mapeamento estrita com os campos:
   - `validationId`
   - `methodology` e `result`
   - `input.geometryHash` (via `hashGeometry` de `@jade/evidence`)
   - `input.commodity` e `input.cutoffDate`
   - `sources[]` (ordenado por fonte/página com hash e horário)
   - `analysis.eventsFound`
   - Áreas e percentuais agregados (explicitamente `null` até aprovação de política)
   - `implementationVersion` / `evidenceUri`
