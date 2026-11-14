(function () {
  "use strict";

  const TZ = "America/Sao_Paulo";
  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const SLOTS_POR_PAGINA = 6;
  const PASSO = 30;
  const KEY_AG = "machado-barbearia:agendamentos";
  const KEY_PF = "machado-barbearia:perfil";

  const SERVICOS = [
    {
      id: "cabelo",
      nome: "Cabelo",
      preco: 40,
      duracao: 30,
      duracaoTexto: "30 min",
      foto: "imagens/cabelo.jpg",
      alt: "Corte de cabelo com pente e máquina, visto de costas",
    },
    {
      id: "barba",
      nome: "Barba",
      preco: 40,
      duracao: 30,
      duracaoTexto: "30 min",
      foto: "imagens/barba.jpg",
      alt: "Barba sendo feita com navalha e espuma",
    },
    {
      id: "cabelo-e-barba",
      nome: "Cabelo e barba",
      preco: 70,
      duracao: 60,
      duracaoTexto: "1 h",
      foto: "imagens/cabelo-e-barba.jpg",
      alt: "Barbeiro cortando o cabelo de um cliente na cadeira",
    },
  ];

  const state = {
    view: "servicos",
    passo: "dias",
    servico: null,
    data: null,
    hora: null,
    pagina: 0,
    diasUteis: [],
    cancelarId: null,
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function agora() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  }

  function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseYmd(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatarPreco(n) {
    return `R$ ${n}`;
  }

  function formatarDataLonga(iso) {
    const dt = parseYmd(iso);
    const txt = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: TZ,
    }).format(dt);
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function formatarHora(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function minutosDeHora(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  function mascararWhatsapp(valor) {
    const d = valor.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function soDigitos(valor) {
    return (valor || "").replace(/\D/g, "");
  }

  function ler(chave, fallback) {
    try {
      const raw = localStorage.getItem(chave);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function gravar(chave, valor) {
    localStorage.setItem(chave, JSON.stringify(valor));
  }

  function agendamentos() {
    return ler(KEY_AG, []);
  }

  function perfil() {
    return ler(KEY_PF, { nome: "", whatsapp: "" });
  }

  function expediente(iso) {
    const dow = parseYmd(iso).getDay();
    if (dow === 0 || dow === 1) return null;
    return { abre: 8 * 60, fecha: dow === 6 ? 19 * 60 : 20 * 60 };
  }

  function gerarDiasUteis() {
    const lista = [];
    const d = agora();
    d.setHours(0, 0, 0, 0);
    let guard = 0;
    while (lista.length < 12 && guard < 40) {
      if (d.getDay() !== 0 && d.getDay() !== 1) {
        lista.push({
          iso: ymd(d),
          dia: String(d.getDate()).padStart(2, "0"),
          mes: String(d.getMonth() + 1).padStart(2, "0"),
          semana: DIAS_SEMANA[d.getDay()],
        });
      }
      d.setDate(d.getDate() + 1);
      guard += 1;
    }
    return lista;
  }

  function ocupadosDemo() {
    const dias = state.diasUteis.length ? state.diasUteis : gerarDiasUteis();
    const alvo = dias[1] || dias[0];
    if (!alvo) return [];
    return [
      { date: alvo.iso, time: "10:00", duration: 30 },
      { date: alvo.iso, time: "14:00", duration: 30 },
    ];
  }

  function faixasOcupadas() {
    const user = agendamentos()
      .filter((a) => a.status === "confirmado")
      .map((a) => ({ date: a.date, time: a.time, duration: a.duration }));
    return ocupadosDemo().concat(user);
  }

  function slotLivre(iso, inicio, duracao) {
    const exp = expediente(iso);
    if (!exp) return false;
    const fim = inicio + duracao;
    if (inicio < exp.abre || fim > exp.fecha) return false;
    const hoje = ymd(agora());
    if (iso < hoje) return false;
    if (iso === hoje) {
      const n = agora();
      const agoraMin = n.getHours() * 60 + n.getMinutes();
      if (inicio <= agoraMin) return false;
    }
    for (const fx of faixasOcupadas()) {
      if (fx.date !== iso) continue;
      const a = minutosDeHora(fx.time);
      const b = a + fx.duration;
      if (inicio < b && fim > a) return false;
    }
    return true;
  }

  function slotsDoDia(iso, duracao) {
    const lista = [];
    const exp = expediente(iso);
    if (!exp) return lista;
    for (let t = exp.abre; t + duracao <= exp.fecha; t += PASSO) {
      lista.push({
        hora: formatarHora(t),
        minutos: t,
        livre: slotLivre(iso, t, duracao),
      });
    }
    return lista;
  }

  function renderServicos() {
    const box = $("lista-servicos");
    box.innerHTML = SERVICOS.map((s) => {
      const selected = state.servico && state.servico.id === s.id;
      return `
        <button type="button" class="servico${selected ? " is-selected" : ""}" data-servico="${s.id}" aria-pressed="${selected ? "true" : "false"}">
          <span class="servico__foto"><img src="${s.foto}" alt="${s.alt}" width="104" height="104"></span>
          <span class="servico__corpo">
            <span class="servico__nome">${s.nome}</span>
            <span class="servico__preco">${formatarPreco(s.preco)}</span>
            <span class="servico__duracao">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.2"/>
                <path d="M12 8.2V12l2.8 2.2"/>
              </svg>
              ${s.duracaoTexto}
            </span>
          </span>
          <span class="radio" aria-hidden="true"><i></i></span>
        </button>`;
    }).join("");
  }

  function renderDias() {
    const inicio = state.pagina * SLOTS_POR_PAGINA;
    const fatia = state.diasUteis.slice(inicio, inicio + SLOTS_POR_PAGINA);
    $("lista-dias").innerHTML = fatia
      .map((d) => {
        const sel = state.data === d.iso;
        return `<button type="button" class="dia-card${sel ? " is-selected" : ""}" role="option" aria-selected="${sel}" data-iso="${d.iso}">
          <span class="dia-card__data">${d.dia}/${d.mes}</span>
          <span class="dia-card__semana">${d.semana}</span>
        </button>`;
      })
      .join("");
    const maxPag = Math.max(0, Math.ceil(state.diasUteis.length / SLOTS_POR_PAGINA) - 1);
    $("dias-prev").disabled = state.pagina <= 0;
    $("dias-next").disabled = state.pagina >= maxPag;
  }

  function renderHorarios() {
    const bloco = $("bloco-horarios");
    if (!state.data || !state.servico) {
      bloco.hidden = true;
      $("painel-agendar").classList.remove("is-com-horarios");
      $("painel-titulo").textContent = tituloDoPasso();
      return;
    }
    bloco.hidden = false;
    $("painel-agendar").classList.add("is-com-horarios");
    $("painel-titulo").textContent = tituloDoPasso();
    const slots = slotsDoDia(state.data, state.servico.duracao);
    $("lista-horarios").innerHTML = slots
      .map((s) => {
        const sel = state.hora === s.hora;
        return `<button type="button" class="slot${sel ? " is-selected" : ""}" data-hora="${s.hora}" ${s.livre ? "" : "disabled"} aria-disabled="${s.livre ? "false" : "true"}">${s.hora}</button>`;
      })
      .join("");
  }

  function renderResumo() {
    if (!state.servico || !state.data || !state.hora) return;
    $("resumo").innerHTML = `
      <dl>
        <div><dt>Serviço</dt><dd>${state.servico.nome}</dd></div>
        <div><dt>Data</dt><dd>${formatarDataLonga(state.data)}</dd></div>
        <div><dt>Horário</dt><dd>${state.hora}</dd></div>
        <div><dt>Duração</dt><dd>${state.servico.duracaoTexto}</dd></div>
        <div><dt>Preço</dt><dd class="preco">${formatarPreco(state.servico.preco)}</dd></div>
      </dl>`;
  }

  function renderHistorico() {
    const box = $("lista-historico");
    const lista = agendamentos().slice().sort((a, b) => {
      if (a.date === b.date) return a.time < b.time ? 1 : -1;
      return a.date < b.date ? 1 : -1;
    });
    if (!lista.length) {
      box.innerHTML = `<p class="vazio">Você ainda não tem horários marcados.</p>`;
      return;
    }
    box.innerHTML = lista
      .map((a) => {
        const cancelado = a.status === "cancelado";
        const futuro = a.date > ymd(agora()) || (a.date === ymd(agora()) && minutosDeHora(a.time) > agora().getHours() * 60 + agora().getMinutes());
        const podeCancelar = !cancelado && futuro;
        return `<article class="agendamento${cancelado ? " is-cancelado" : ""}">
          ${cancelado ? `<p class="selo">Cancelado</p>` : ""}
          <div class="agendamento__topo">
            <p class="agendamento__servico">${a.serviceName}</p>
            <p class="agendamento__preco">${formatarPreco(a.price)}</p>
          </div>
          <p class="agendamento__meta">${formatarDataLonga(a.date)} · ${a.time} · ${a.durationText}</p>
          ${podeCancelar ? `<button type="button" class="btn btn--danger" data-cancelar="${a.id}">Cancelar horário</button>` : ""}
        </article>`;
      })
      .join("");
  }

  function preencherPerfilForm() {
    const p = perfil();
    $("perfil-nome").value = p.nome || "";
    $("perfil-whatsapp").value = p.whatsapp ? mascararWhatsapp(p.whatsapp) : "";
  }

  function preencherConfirmacao() {
    const p = perfil();
    $("input-nome").value = p.nome || "";
    $("input-whatsapp").value = p.whatsapp ? mascararWhatsapp(p.whatsapp) : "";
    limparErro($("campo-nome"));
    limparErro($("campo-whatsapp"));
  }

  function mostrarView(nome) {
    state.view = nome;
    $$(".view").forEach((el) => {
      el.hidden = el.dataset.view !== nome;
    });
    $$(".tabbar__btn").forEach((btn) => {
      const ativo = btn.dataset.nav === (nome === "servicos" ? "servicos" : nome);
      btn.classList.toggle("is-active", ativo);
      if (ativo) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    if (nome === "historico") renderHistorico();
    if (nome === "perfil") {
      preencherPerfilForm();
      $("perfil-aviso").textContent = "";
    }
    window.scrollTo(0, 0);
  }

  function tituloDoPasso() {
    if (state.passo === "confirmacao") return "Confirme seu horário";
    if (state.passo === "sucesso") return "Pronto";
    if (state.data) return "Escolha o horário";
    return "Escolha o dia";
  }

  function mostrarPasso(passo) {
    state.passo = passo;
    $("passo-dias").hidden = passo !== "dias";
    $("passo-confirmacao").hidden = passo !== "confirmacao";
    $("passo-sucesso").hidden = passo !== "sucesso";
    $("painel-titulo").textContent = tituloDoPasso();
    if (passo === "sucesso") {
      const check = document.querySelector("#passo-sucesso .check");
      if (check) {
        check.replaceWith(check.cloneNode(true));
      }
    }
  }

  function abrirPainel(servico) {
    state.servico = servico;
    state.data = null;
    state.hora = null;
    state.pagina = 0;
    state.diasUteis = gerarDiasUteis();
    $("painel-foto").src = servico.foto;
    $("painel-foto").alt = servico.alt;
    $("painel-servico-nome").textContent = servico.nome;
    $("painel-servico-duracao").textContent = servico.duracaoTexto;
    $("bloco-horarios").hidden = true;
    $("painel-agendar").classList.remove("is-com-horarios");
    renderServicos();
    renderDias();
    mostrarPasso("dias");
    $("painel-agendar").hidden = false;
    document.body.classList.add("is-painel-aberto");
    $("painel-agendar").querySelector(".painel__caixa").focus();
  }

  function fecharPainel() {
    $("painel-agendar").hidden = true;
    document.body.classList.remove("is-painel-aberto");
    if (state.passo !== "sucesso") {
      state.servico = null;
      state.data = null;
      state.hora = null;
    }
    state.passo = "dias";
    renderServicos();
  }

  function validarNome(valor) {
    return (valor || "").trim().length >= 2;
  }

  function validarWhatsapp(valor) {
    const d = soDigitos(valor);
    return d.length === 10 || d.length === 11;
  }

  function marcarErro(campo, ok) {
    campo.classList.toggle("is-invalid", !ok);
  }

  function limparErro(campo) {
    campo.classList.remove("is-invalid");
  }

  function confirmarAgendamento() {
    const nome = $("input-nome").value;
    const whats = $("input-whatsapp").value;
    const okNome = validarNome(nome);
    const okWhats = validarWhatsapp(whats);
    marcarErro($("campo-nome"), okNome);
    marcarErro($("campo-whatsapp"), okWhats);
    if (!okNome || !okWhats) return;
    if (!state.servico || !state.data || !state.hora) return;
    if (!slotLivre(state.data, minutosDeHora(state.hora), state.servico.duracao)) {
      renderHorarios();
      mostrarPasso("dias");
      return;
    }
    const item = {
      id: `ag-${Date.now()}`,
      serviceId: state.servico.id,
      serviceName: state.servico.nome,
      price: state.servico.preco,
      duration: state.servico.duracao,
      durationText: state.servico.duracaoTexto,
      date: state.data,
      time: state.hora,
      name: nome.trim(),
      whatsapp: mascararWhatsapp(whats),
      createdAt: new Date().toISOString(),
      status: "confirmado",
    };
    const lista = agendamentos();
    lista.push(item);
    gravar(KEY_AG, lista);
    gravar(KEY_PF, { nome: nome.trim(), whatsapp: mascararWhatsapp(whats) });
    $("sucesso-texto").textContent = `Te esperamos ${formatarDataLonga(state.data)}, às ${state.hora}, para ${state.servico.nome.toLowerCase()}.`;
    mostrarPasso("sucesso");
  }

  function irParaConfirmacao() {
    renderResumo();
    preencherConfirmacao();
    mostrarPasso("confirmacao");
  }

  function onVoltarPainel() {
    if (state.passo === "confirmacao") {
      mostrarPasso("dias");
      renderDias();
      renderHorarios();
      return;
    }
    if (state.passo === "sucesso") {
      fecharPainel();
      mostrarView("historico");
      return;
    }
    fecharPainel();
  }

  function ligarEventos() {
    $("lista-servicos").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-servico]");
      if (!btn) return;
      const servico = SERVICOS.find((s) => s.id === btn.dataset.servico);
      if (servico) abrirPainel(servico);
    });

    $("lista-dias").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-iso]");
      if (!btn) return;
      state.data = btn.dataset.iso;
      state.hora = null;
      renderDias();
      renderHorarios();
    });

    $("lista-horarios").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-hora]");
      if (!btn || btn.disabled) return;
      state.hora = btn.dataset.hora;
      renderHorarios();
      irParaConfirmacao();
    });

    $("dias-prev").addEventListener("click", () => {
      if (state.pagina > 0) {
        state.pagina -= 1;
        renderDias();
      }
    });
    $("dias-next").addEventListener("click", () => {
      const maxPag = Math.max(0, Math.ceil(state.diasUteis.length / SLOTS_POR_PAGINA) - 1);
      if (state.pagina < maxPag) {
        state.pagina += 1;
        renderDias();
      }
    });

    $("painel-voltar").addEventListener("click", onVoltarPainel);
    $("painel-remover").addEventListener("click", fecharPainel);
    $("painel-agendar").querySelector("[data-fechar-painel]").addEventListener("click", () => {
      if (state.passo === "sucesso") {
        fecharPainel();
        return;
      }
      fecharPainel();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("painel-agendar").hidden) {
        if (state.passo === "sucesso") fecharPainel();
        else onVoltarPainel();
      }
      if (e.key === "Escape" && !$("modal-cancelar").hidden) {
        $("modal-cancelar").hidden = true;
      }
    });

    $("form-confirmacao").addEventListener("submit", (e) => {
      e.preventDefault();
      confirmarAgendamento();
    });
    $("input-whatsapp").addEventListener("input", (e) => {
      const pos = e.target.selectionStart;
      const before = e.target.value;
      e.target.value = mascararWhatsapp(e.target.value);
      if (document.activeElement === e.target && pos === before.length) {
        e.target.selectionStart = e.target.selectionEnd = e.target.value.length;
      }
    });

    $("btn-ver-historico").addEventListener("click", () => {
      fecharPainel();
      mostrarView("historico");
    });

    $$("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const nome = el.dataset.nav;
        if (!nome) return;
        if (el.tagName === "A") e.preventDefault();
        if (!$("painel-agendar").hidden && state.passo !== "sucesso") fecharPainel();
        else if (!$("painel-agendar").hidden) fecharPainel();
        mostrarView(nome === "servicos" ? "servicos" : nome);
      });
    });

    $("lista-historico").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cancelar]");
      if (!btn) return;
      state.cancelarId = btn.dataset.cancelar;
      const item = agendamentos().find((a) => a.id === state.cancelarId);
      if (!item) return;
      $("modal-texto").textContent = `${item.serviceName} · ${formatarDataLonga(item.date)} às ${item.time}. Essa ação libera o horário.`;
      $("modal-cancelar").hidden = false;
    });
    $("btn-confirma-cancelar").addEventListener("click", () => {
      if (!state.cancelarId) return;
      const lista = agendamentos().map((a) =>
        a.id === state.cancelarId ? { ...a, status: "cancelado" } : a
      );
      gravar(KEY_AG, lista);
      state.cancelarId = null;
      $("modal-cancelar").hidden = true;
      renderHistorico();
    });
    $$("[data-fechar-modal]").forEach((el) => {
      el.addEventListener("click", () => {
        $("modal-cancelar").hidden = true;
        state.cancelarId = null;
      });
    });

    $("form-perfil").addEventListener("submit", (e) => {
      e.preventDefault();
      const nome = $("perfil-nome").value;
      const whats = $("perfil-whatsapp").value;
      const temNome = nome.trim().length > 0;
      const temWhats = soDigitos(whats).length > 0;
      const okNome = !temNome || validarNome(nome);
      const okWhats = !temWhats || validarWhatsapp(whats);
      marcarErro($("perfil-campo-nome"), okNome);
      marcarErro($("perfil-campo-whatsapp"), okWhats);
      if (!okNome || !okWhats) return;
      if (!temNome && !temWhats) {
        gravar(KEY_PF, { nome: "", whatsapp: "" });
      } else if (temNome && temWhats && validarNome(nome) && validarWhatsapp(whats)) {
        gravar(KEY_PF, { nome: nome.trim(), whatsapp: mascararWhatsapp(whats) });
      } else if (temNome && validarNome(nome)) {
        gravar(KEY_PF, { ...perfil(), nome: nome.trim() });
      } else if (temWhats && validarWhatsapp(whats)) {
        gravar(KEY_PF, { ...perfil(), whatsapp: mascararWhatsapp(whats) });
      }
      $("perfil-aviso").textContent = "Dados salvos neste aparelho.";
    });
    $("perfil-whatsapp").addEventListener("input", (e) => {
      e.target.value = mascararWhatsapp(e.target.value);
    });
  }

  function iniciar() {
    state.diasUteis = gerarDiasUteis();
    renderServicos();
    ligarEventos();
    mostrarView("servicos");
  }

  iniciar();

  window.__barbearia = {
    abrirServico(id) {
      const s = SERVICOS.find((x) => x.id === id);
      if (s) abrirPainel(s);
    },
    escolherDia(iso) {
      state.data = iso;
      state.hora = null;
      const idx = state.diasUteis.findIndex((d) => d.iso === iso);
      if (idx >= 0) state.pagina = Math.floor(idx / SLOTS_POR_PAGINA);
      renderDias();
      renderHorarios();
    },
    escolherHora(hora) {
      state.hora = hora;
      irParaConfirmacao();
    },
    diasUteis: () => state.diasUteis,
    state,
  };
})();
