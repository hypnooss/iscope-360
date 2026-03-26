# 🧠 iScope360 — System Contracts

Este diretório contém os **contratos oficiais do sistema**.

Eles representam a **fonte única da verdade (Single Source of Truth)** para:

- Arquitetura
- Comunicação entre componentes
- Execução de tarefas
- Governança do Agent
- Evolução do sistema

---

# 🗺️ Visão Geral da Arquitetura

O sistema é dividido em **3 camadas principais**:

```
Platform (Backend / Inteligência)
        ↓
     Tasks (Contrato)
        ↓
Agent (Execução)
```

---

# 🗂️ Estrutura Real dos Contratos

```
contracts/
├── README.md                        ← este arquivo
├── USAGE.md                         ← guia rápido de uso
│
├── architecture/                    ← como os componentes são construídos
│   ├── agent.yaml                   ← comportamento completo do Agent (v1.1)
│   ├── platform.yaml                ← arquitetura da Plataforma
│   ├── orchestration.yaml           ← distribuição de tarefas entre agents
│   ├── module.yaml                  ← contrato de módulos de execução
│   └── architecture-map.md         ← mapa visual de dependências
│
├── schemas/                         ← contratos de mensagens e dados
│   ├── task.yaml                    ← contrato de task (Platform → Agent)
│   ├── task.schema.json             ← JSON Schema validável de task
│   ├── result.yaml                  ← contrato de resultado (Agent → Platform) (v1.1)
│   ├── result.schema.json           ← JSON Schema validável de result
│   ├── event.yaml                   ← tipos de eventos Kafka (v1.2)
│   ├── event.schema.json            ← JSON Schema validável de event
│   ├── protocol.yaml                ← protocolo de comunicação Agent ↔ Platform
│   └── errors.yaml                  ← registro centralizado de erros
│
├── governance/                      ← regras e princípios do sistema
│   ├── rules.yaml                   ← regras de governança com IDs rastreáveis (v1.1)
│   ├── security.yaml                ← políticas de segurança (v1.2)
│   └── principles.yaml             ← princípios arquiteturais fundamentais
│
└── templates/
    └── template-definition.yaml    ← contrato de templates de coleta
```

---

# 🧩 Mapa de Componentes

```
Platform
 ├── Infrastructure (Kafka, DB, APIs)
 ├── Orchestration (distribuição de tarefas)
 ├── Templates (inteligência do produto)
 └── Processing (workers)

Agent
 ├── Task Engine
 ├── Execution Engine
 ├── Modules (nmap, httpx, etc.)
 ├── Sandbox
 ├── Local Storage (SQLite)
 └── [role: proxy] Relay de comunicação

Task
 └── Contrato entre Platform e Agent
```

---

# 📦 Descrição dos Contratos

## 📁 architecture/agent.yaml

Define o comportamento completo do Agent:

- execução controlada (`execution_engine`)
- gerenciamento de tasks (`task_engine`)
- isolamento (`sandbox`)
- armazenamento local (`sqlite`)
- update com rollback
- segurança e governança
- **roles**: `worker` e `proxy`
- **proxy**: discovery DNS, relay de comunicação, high availability

👉 O Agent **NÃO possui inteligência de negócio**

---

## 📁 architecture/platform.yaml

Define a arquitetura da plataforma:

- ingestão de dados
- Kafka (event streaming)
- armazenamento (OpenSearch, Timescale, PostgreSQL)
- processamento assíncrono
- API e realtime

👉 A plataforma é o **cérebro do sistema**

---

## 📁 schemas/task.yaml + task.schema.json

Contrato de comunicação entre Platform e Agent.

Define:

- estrutura de execução
- módulo a ser executado
- parâmetros e limites
- segurança (assinatura Ed25519)
- `requires_role`: permite exigir que a task seja executada por um `proxy`

👉 Toda execução deve passar por uma task válida e assinada

---

## 📁 schemas/result.yaml + result.schema.json

Resposta padrão do Agent para a plataforma.

Define:

- metadata (task_id, agent_id, correlation_id, tenant_id)
- status: `success` | `failed` | `partial`
- métricas de execução (duration, retries, cpu, memory)
- estrutura de erros (`errors.yaml`)
- **campos de proxy relay**: `origin_agent_id`, `via_proxy`

---

## 📁 schemas/event.yaml + event.schema.json

Tipos de eventos trafegados no sistema via Kafka.

Categorias:

- **Task lifecycle**: `task.created`, `task.dispatched`, `task.started`, `task.completed`, `task.failed`
- **Agent**: `agent.heartbeat`, `agent.connected`, `agent.disconnected`, `agent.status`
- **Alertas**: `alert.generated`
- **Proxy (estado)**: `proxy.promoted`, `proxy.demoted`, `proxy.unavailable`

Campos condicionais de relay: `origin_agent_id`, `via_proxy`

---

## 📁 schemas/protocol.yaml

Protocolo de comunicação Agent ↔ Platform. Define mensagens de controle, comandos e handshake.

---

## 📁 schemas/errors.yaml

Registro centralizado de erros com `code`, `name`, `category`, `retriable`.

👉 Todos os erros em `result.yaml` devem referenciar este registro.

---

## 📁 architecture/orchestration.yaml

Define como a plataforma distribui trabalho:

- divisão de workloads (batching)
- distribuição entre agents
- controle de concorrência
- retry e reprocessamento
- agregação de resultados

👉 Exemplo: 60 IPs → blocos de 10 → distribuídos entre agents

---

## 📁 governance/security.yaml

Políticas de segurança do sistema (v1.2):

- **signing**: Ed25519 preferido, HMAC-SHA256 e RSA-PSS suportados
- **encryption**: TLS 1.3 em trânsito, mTLS obrigatório para agents
- **secrets_management**: OS keystore (agent), HashiCorp Vault (platform)
- **access_control**: RBAC + identidade por `agent_id + certificate + tenant_id`
- **proxy_security**: regras de relay, audit, least privilege, validação de identidade

---

## 📁 governance/rules.yaml

Regras de governança com IDs rastreáveis (v1.1):

| ID | Categoria | Descrição |
|---|---|---|
| EXEC-001 | Execução | task deve ser validada antes da execução |
| EXEC-002 | Execução | execução deve usar `execution_engine` |
| EXEC-003 | Execução | sandbox é obrigatório |
| SEC-001 | Segurança | execução arbitrária é proibida |
| SEC-002 | Segurança | módulos devem estar na allowlist |
| SEC-003 | Segurança | comunicação deve usar TLS/mTLS |
| SEC-004 | Segurança | proxy não deve modificar payload |
| ARCH-001 | Arquitetura | sem lógica de negócio no agent |
| ARCH-002 | Arquitetura | sem hardcoding |
| ARCH-003 | Arquitetura | agent não acessa serviços internos diretamente |
| ORCH-001 | Orquestração | constraints de execução devem ser respeitados |
| ORCH-002 | Orquestração | tasks `requires_role=proxy` devem ir para proxy |
| OBS-001 | Observabilidade | `correlation_id` é obrigatório |
| UPD-001 | Updates | update deve suportar rollback |
| UPD-002 | Updates | update deve ser atômico |

---

# 🔀 Arquitetura de Proxy (Relay)

Agentes sem acesso direto à internet comunicam-se via um **agente eleito como proxy**.

## Fluxo de relay

```
Agent (sem internet)
    ↓ conexão direta ao proxy (rede local)
Proxy Agent (eleito pela plataforma)
    ↓ relay via TLS/mTLS
Platform
```

## Contratos envolvidos

- `agent.yaml` → roles (`worker`, `proxy`), discovery DNS (`iscope-proxy`), high availability
- `security.yaml` → `proxy_security`: relay puro, sem alterar payload, audit obrigatório
- `event.yaml` → `proxy.promoted`, `proxy.demoted`, `proxy.unavailable`
- `result.yaml` → campos `origin_agent_id` e `via_proxy`
- `rules.yaml` → `SEC-004` (proxy não modifica payload), `ORCH-002` (proxy obrigatório quando exigido)

## Regras de identidade no relay

- `origin_agent_id` → identidade **real** do agente que gerou o resultado
- `via_proxy` → identidade do agente que atuou como relay
- A plataforma **sempre usa `origin_agent_id` como identidade principal**
- `via_proxy` **não deve estar presente** para agentes com conexão direta

---

# ⚠️ Princípios Fundamentais

## 🔥 1. Agent é burro

O Agent:

- NÃO toma decisões
- NÃO contém regras de negócio
- NÃO contém lógica hardcoded de coleta

👉 Ele apenas executa

---

## 🔥 2. Plataforma é inteligente

Toda inteligência deve estar na plataforma:

- templates
- regras
- parsing
- análise

---

## 🔥 3. Nada hardcoded

❌ Errado:
- lógica de API no código
- regras fixas no agent

✔️ Correto:
- tudo definido via templates e contratos

---

## 🔥 4. Execução controlada

Toda execução deve:

- passar pelo `task_engine`
- passar pelo `execution_engine`
- respeitar sandbox
- respeitar limites (CPU, timeout)

---

## 🔥 5. Tudo auditável

- tasks são rastreáveis
- execuções são logadas
- resultados são persistidos
- ações via proxy são auditadas

---

# 🚫 Anti-patterns (PROIBIDO)

- execução direta de comandos fora do `execution_engine`
- lógica de negócio dentro do agent
- templates hardcoded
- update sem rollback
- execução arbitrária sem validação
- proxy alterando payload de mensagens
- ausência de `origin_agent_id` em mensagens via proxy

---

# 🔄 Fluxo de Execução

```
Platform
   ↓
Orchestration
   ↓
Task (contrato assinado)
   ↓
Agent (ou via Proxy)
   ↓
Execution Engine
   ↓
Module Adapter
   ↓
Tool (nmap, httpx, etc.)
   ↓
Result → Platform
```

---

# 🧠 Tipos de Módulo

## 🔹 Módulos Simples
- nmap, masscan, amass
- httpx, nuclei
- ssh, powershell
- bloodhound, pingcastle

## 🔹 Módulos Compostos
- `surface_scan`

👉 Executam pipelines:

```
reverse_dns → ping → nmap → httpx → nuclei
```

---

# ✅ JSON Schema Validation

Os contratos de mensagem possuem **JSON Schemas validáveis**:

| Contrato | Schema |
|---|---|
| `schemas/task.yaml` | `schemas/task.schema.json` |
| `schemas/result.yaml` | `schemas/result.schema.json` |
| `schemas/event.yaml` | `schemas/event.schema.json` |

👉 Use esses schemas para validar mensagens em testes e integrações.

---

# 🗃️ Separação Importante

## Código (Repo)
- contratos
- arquitetura
- regras
- JSON Schemas

## Runtime (Banco)
- templates
- regras de compliance dinâmicas
- configurações por tenant

---

# 🚀 Evolução Futura

## 🔹 Curto prazo

- [x] padronizar output (schema único — `result.yaml` + `result.schema.json`)
- [x] validação automática de contratos (`*.schema.json`)
- [ ] consolidar `system.blueprint.yaml`
- [ ] padronizar module adapters
- [ ] implementar execution engine real
- [ ] implementar SQLite no agent

---

## 🔹 Médio prazo

- [ ] versionamento de templates
- [ ] versionamento de tasks
- [ ] controle de compatibilidade agent ↔ platform
- [x] validação automática de contratos (JSON Schema)

---

## 🔹 Longo prazo

- [ ] policy engine (regras dinâmicas)
- [ ] multi-agent orchestration avançada
- [ ] execução distribuída inteligente
- [ ] SIEM integrado (Wazuh/OpenSearch)

---

# 🧪 Como usar esses contratos

Antes de implementar qualquer feature:

## ✔️ Pergunte:

- isso está nos contratos?
- isso viola alguma regra (`rules.yaml`)?
- isso adiciona inteligência no agent?
- se envolve relay: os campos `origin_agent_id` e `via_proxy` estão corretos?

---

## ✔️ Se a resposta for SIM (violação)

👉 parar e ajustar arquitetura

---

# 🧠 Objetivo Final

Garantir que o sistema seja:

- escalável
- seguro
- previsível
- extensível
- livre de hardcoding

---

# 📌 Regra de Ouro

> Se não está nos contratos, não deve ser implementado sem revisão.
