# JADE-MT — Plano de Atividades — Estagiário 1

**Área:** Blockchain / Evidência / Stellar / Soroban

**Responsabilidade principal:**

```text
packages/evidence/
packages/stellar/
contracts/jade-attestation/
```

O repositório já possui os stubs e uma primeira versão do contrato.
O objetivo não é recriar a arquitetura, mas transformar as partes ainda provisórias em uma implementação testável e justificável.

---

# 16–30 Set — Modelo de evidência + arquitetura blockchain

## Objetivo da etapa

Responder:

> **Dado um parecer ambiental produzido pelo oráculo, qual é o menor conjunto de informações que precisamos preservar e registrar para que essa validação possa ser auditada e verificada posteriormente?**

A prioridade desta etapa é simplicidade.

Não adicionar DID, Verifiable Credentials, SBT, Merkle Tree, multisig ou outros mecanismos enquanto o núcleo mínimo não estiver validado.

---

## Atividade 1 — Revisar e fechar o `EvidenceManifest v0.1`

### Contexto

Já existe um `EvidenceManifestV01` provisório em:

```text
packages/schemas/src/index.ts
```

Ele deve ser tratado como ponto de partida, não como especificação definitiva.

### Trabalho

Revisar os campos atuais e documentar, para cada um:

- significado;
- tipo;
- obrigatório ou opcional;
- origem do valor;
- se contém informação sensível;
- se é necessário para reprodução;
- se é necessário para auditoria;
- se deve ficar somente off-chain;
- se alguma parte precisa estar on-chain.

Avaliar especificamente:

```text
validationId
methodology
geometryHash
commodity
cutoffDate
sources[]
datasetVersion
layer
retrievedAt
payloadHash
intersectionAreaM2
intersectionPercentage
eventsFound
result
```

Também avaliar se campos ainda não existentes são realmente necessários, por exemplo:

```text
lotId
reference/storage URI
warnings
implementation version
```

Não adicionar um campo apenas porque ele parece útil.

### Entregável

```text
docs/research/evidence-manifest-v01.md
```

e proposta de alteração do schema existente, se necessária.

### Resultado esperado

Um único modelo de evidência v0.1 que possa ser usado pelo backend, pela camada de hashing e pelo contrato.

---

## Atividade 2 — Definir a estratégia de hashing e canonicalização

### Contexto

O projeto já possui:

```text
packages/evidence/src/canonicalize-evidence.ts
packages/evidence/src/hash-evidence.ts
```

O SHA-256 já está previsto, mas ainda não existe uma definição final dos bytes que devem ser hashados.

### Trabalho

Definir separadamente:

### `geometryHash`

Responder:

- qual geometria é hashada;
- geometria original ou normalizada;
- representação utilizada;
- relação com CRS;
- encoding;
- precisão.

### `payloadHash`

Responder:

- qual payload da fonte ambiental é hashado;
- como tratar paginação;
- ordem das páginas;
- payload bruto versus transformado;
- quais metadados ficam fora do hash.

### `evidenceHash`

Responder:

- qual objeto completo é utilizado;
- quais campos entram;
- qual canonicalização é adotada;
- como tratar ordem de propriedades;
- números;
- listas;
- `null`;
- datas;
- Unicode.

Investigar uma estratégia padronizada de canonicalização, evitando simplesmente aplicar `JSON.stringify()` de forma implícita.

### Implementação

Depois da decisão:

- implementar o canonicalizer;
- atualizar testes;
- criar vetores conhecidos;
- comprovar que mudança apenas na ordem de propriedades não muda o hash;
- comprovar que alteração real da evidência muda o hash.

### Entregável

```text
docs/research/evidence-hashing.md
```

---

## Atividade 3 — Revisar o registro mínimo on-chain e a autenticação

### Contexto

O contrato atual já possui:

```text
attest()
get_attestation()
revoke()
```

e estrutura semelhante a:

```text
validation_id
evidence_hash
methodology_version
result
validator
status
```

Ele também utiliza autorização Soroban.

### Trabalho

Avaliar campo por campo:

- o que realmente precisa ficar em storage;
- o que poderia ser evento;
- o que seria redundante;
- o que não deveria ser público.

Investigar o modelo atual de autenticação:

- quem é o `validator`;
- como é autorizado;
- o papel do `admin`;
- o que `require_auth()` comprova;
- se existe necessidade real de armazenar uma assinatura adicional;
- se a assinatura da transação/autorização já é suficiente para a PoC.

Executar e revisar os testes existentes:

- emissão autorizada;
- emissão não autorizada;
- consulta;
- revogação;
- tentativa de sobrescrita;
- ausência de autorização.

### Entregável

```text
docs/research/attestation-model-v01.md
```

### Resultado esperado

Modelo mínimo de atestação definido e contrato atual ajustado apenas se necessário.

---

## Atividade 4 — Investigar Storage e TTL do Soroban

### Contexto

O contrato atual utiliza:

```text
Instance Storage
Persistent Storage
```

e já possui um teste pendente para lifecycle/TTL.

### Trabalho

Investigar e testar:

- Instance;
- Persistent;
- Temporary;
- TTL;
- extensão de TTL;
- archival;
- restoration;
- impacto de manter certificados por anos;
- possíveis custos.

Não produzir apenas resumo da documentação.

Criar pelo menos um experimento no contrato/testes.

### Entregável

```text
docs/research/soroban-storage-ttl.md
```

### Resultado esperado

Proposta de política para:

- onde armazenar atestação;
- como manter o estado vivo;
- quando renovar;
- como recuperar estado arquivado.

---

## Entregáveis de 16–30 Set

Ao final da etapa, entregar:

1. `EvidenceManifest v0.1` revisado;
2. tabela on-chain × off-chain;
3. estratégia de `geometryHash`, `payloadHash` e `evidenceHash`;
4. canonicalização definida;
5. modelo de autenticação do validator;
6. contrato mínimo revisado;
7. testes automatizados;
8. experimento/documentação de TTL;
9. exemplo de manifesto + hash;
10. lista de questões ainda abertas.
