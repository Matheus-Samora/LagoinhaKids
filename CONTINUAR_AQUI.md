# 🚀 GUIA DE CONTINUIDADE DO DESENVOLVIMENTO — LAGOINHA KIDS

Este documento foi preparado para permitir a **continuidade imediata e perfeita** do desenvolvimento a partir de qualquer outro computador ou sessão do **Antigravity**.

---

## 📌 INSTRUÇÃO RÁPIDA PARA A NOVA SESSÃO DO ANTIGRAVITY
Ao abrir a nova sessão no Antigravity no computador de casa, basta enviar a mensagem:

> **"Estou continuando o desenvolvimento do Lagoinha Kids a partir do arquivo CONTINUAR_AQUI.md. Verifique o status atual e vamos continuar."**

---

## 🏗️ ARQUITETURA DO PROJETO

* **Frontend:** Vite SPA puro (`src/main.js`, `src/school.js`, `src/style.css`, `src/mobile.css`), 100% responsivo e com identidade visual monocromática (Preto & Branco / Zinc).
* **Backend:** FastAPI (Python) em `backend/app.py`, `backend/school.py` e `backend/store.py`.
* **Banco de Dados:** SQLite em `runtime/kids.sqlite3` (migrado com suporte a alergias, etiquetas de 4 dígitos, termos LGPD e tokens de push).
* **Mobile Nativo:** Capacitor 8 (`@capacitor/core`, `@capacitor/app`, `@capacitor/camera`), com suporte Android e iOS.
* **Testes Automatizados:** 27 testes em `tests/test_app.py` e `tests/test_school.py` (100% aprovados).
* **Live OTA / Atualização Contínua:** Endpoint `/api/version` e motor `checkLiveUpdate()` que atualiza os APKs instalados em tempo real sem reinstalação.

---

## ✅ O QUE JÁ FOI IMPLEMENTADO E HOMOLOGADO

1. **UX/UI & Ergonomia Mobile:**
   * Bottom Navigation Bar fixa no rodapé para mobile com abas contextuais por perfil.
   * Contraste elevado para conformidade WCAG 2.1 AA (piso 4.93:1).
   * Touch targets mínimos de 44x44px em todos os botões e ícones.
   * Modais responsivos convertidos em Bottom Sheets no celular com arraste e animação suave.
   * Feedback de loading com spinners animados (`.spin`).
2. **Segurança da Criança & Conformidade LGPD (Art. 14):**
   * Registro auditável de consentimento formal na tabela `terms_consents` com IP e User-Agent.
   * Endpoint `GET /api/terms/privacy` e modal de termos jurídicos acessível no app.
   * Blindagem multitenancy e rate-limiting no cadastro e login.
   * Criptografia Fernet (AES-128 CBC) compatível com chaves em variáveis de ambiente (`KIDS_BIOMETRIC_KEY`).
3. **Operações Ministeriais do Culto:**
   * Sistema de Etiquetas de Segurança Pareadas (Claim Tag alfanumérica de 4 caracteres randômicos).
   * Protocolo de Retirada ("No Tag, No Child") com conferência obrigatória da etiqueta dos pais antes da liberação.
   * Prontuário médico com alertas visuais imediatos de alergias alimentares, medicação de emergência e necessidades especiais.
   * Cadastro prévio de pessoas autorizadas para retirada de terceiros (`authorized_pickups`).
4. **Navegação & Mobile:**
   * Histórico de abas (`navHistory`) com botão dinâmico visual `← Voltar` no cabeçalho.
   * Interceptação nativa do botão voltar do Android (`@capacitor/app`) e gestos de borda.
   * **Duplo clique para sair:** Na aba inicial, o 1º toque exibe aviso e apenas o 2º toque dentro de 2.5s encerra o app.
   * **Live Updates OTA:** Sincronização automática de atualizações no APK sem reinstalar.

---

## 💻 COMO RODAR NO NOVO COMPUTADOR

### 1. Dependências do Frontend
```bash
npm install
npm run build
```

### 2. Dependências do Backend Python
```bash
pip install fastapi uvicorn httpx pydantic numpy cryptography pytest
# (Opcional para biometria facial completa: pip install opencv-python)
```

### 3. Iniciar o Servidor Backend (Porta 8770)
```bash
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8770 --reload
```

### 4. Rodar os Testes
```bash
python -m pytest
```

### 5. Iniciar o Túnel para Testar no Celular (Opcional)
```bash
cloudflared tunnel --url http://127.0.0.1:8770
```

---

## 📂 ARQUIVOS CHAVE DO PROJETO
* `backend/app.py`: Rotas da API, autenticação, chamada, biometria e versão Live OTA.
* `backend/store.py`: Banco SQLite, esquemas de tabelas e funções criptográficas.
* `backend/school.py`: Lógica escolar (turmas, aulinhas, reservas, alunos e saúde).
* `src/main.js`: Aplicação SPA principal, roteamento, auto-update e modais.
* `src/school.js`: Componentes visuais de aulinhas, chamada e cartões de alunos.
* `src/style.css` e `src/mobile.css`: Folhas de estilo monocromáticas (desktop e mobile).
* `capacitor.config.json`: Configuração do Capacitor Android/iOS.
* `public/lagoinha-kids.apk`: Instalador APK Android compilado pronto para uso.
