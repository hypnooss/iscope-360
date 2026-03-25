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

Platform (Backend / Inteligência)
        ↓
     Tasks (Contrato)
        ↓
Agent (Execução)

---

# 🧩 Mapa Completo

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

 └── Local Storage


Task

 └── Contrato entre Platform e Agent

---

# 📦 Estrutura dos Contratos

## 📁 agent.yaml

Define o comportamento do Agent:

- execução controlada (execution_engine)
- gerenciamento de tasks
- isolamento (sandbox)
- armazenamento local (sqlite)
- update com rollback
- segurança e governança

👉 O Agent **NÃO possui inteligência de negócio**

---

## 📁 platform.yaml

Define a arquitetura da plataforma:

- ingestão de dados
- Kafka (event streaming)
- armazenamento (OpenSearch, Timescale, PostgreSQL)
- processamento assíncrono
- API e realtime

👉 A plataforma é o **cérebro do sistema**

---

## 📁 task.yaml

Contrato de comunicação entre Platform e Agent.

Define:

- estrutura de execução
- módulo a ser executado
- parâmetros
- limites
- segurança (assinatura)

👉 Toda execução deve passar por uma task válida

---

## 📁 orchestration.yaml

Define como a plataforma distribui trabalho:

- divisão de workloads (batching)
- distribuição entre agents
- controle de concorrência
- retry e reprocessamento
- agregação de resultados

👉 Exemplo:
60 IPs → divididos em blocos de 10 → distribuídos entre agents

---

## 📁 template.yaml

Define como funciona o sistema de templates.

Templates representam:

- o que coletar
- como coletar
- como interpretar
- como avaliar

👉 Templates **NÃO vivem no agent**
👉 Templates vivem no **banco de dados**

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
- tudo definido via templates

---

## 🔥 4. Execução controlada

Toda execução deve:

- passar pelo task_engine
- passar pelo execution_engine
- respeitar sandbox
- respeitar limites (CPU, timeout)

---

## 🔥 5. Tudo auditável

- tasks são rastreáveis
- execuções são logadas
- resultados são persistidos

---

# 🚫 Anti-patterns (PROIBIDO)

- execução direta de comandos fora do execution_engine
- lógica de negócio dentro do agent
- templates hardcoded
- update sem rollback
- execução arbitrária sem validação

---

# 🔄 Fluxo de Execução

Platform
   ↓   
Orchestration
   ↓   
Task (contrato)
   ↓   
Agent
   ↓   
Execution Engine
   ↓   
Module Adapter
   ↓   
Tool (nmap, httpx, etc.)
   ↓   
Resultado → Platform

---

# 🧠 Tipos de Módulo

## 🔹 Módulos Simples
- nmap
- httpx
- nuclei
- ssh

## 🔹 Módulos Compostos
- surface_scan

👉 Executam pipelines:

reverse_dns → ping → nmap → httpx → nuclei

---

# 🗃️ Separação Importante

## Código (Repo)
- contratos
- arquitetura
- regras

## Runtime (Banco)
- templates
- regras de compliance
- configurações dinâmicas

---

# 🚀 Evolução Futura

## 🔹 Curto prazo

- [ ] consolidar system.blueprint.yaml
- [ ] padronizar module adapters
- [ ] implementar execution engine real
- [ ] implementar SQLite no agent
- [ ] padronizar output (schema único)

---

## 🔹 Médio prazo

- [ ] versionamento de templates
- [ ] versionamento de tasks
- [ ] controle de compatibilidade agent ↔ platform
- [ ] validação automática de contratos

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

- isso está no blueprint?
- isso viola alguma regra?
- isso adiciona inteligência no agent?

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
