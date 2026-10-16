/*
 * Página de Recrutamento: roteiro para conduzir o recrutamento e fichas salvas no site.
 * Xerife, Sub-Xerife e Adm leem, criam, editam e excluem fichas (/api/recrutamentos).
 *
 * O roteiro abaixo é a fonte única das perguntas: a ficha guarda as respostas na mesma ordem.
 * Ao mudar perguntas, mantenha a quantidade (3 pessoais, 8 do questionário) ou ajuste também
 * PERSONAL_QUESTIONS / PSYCH_QUESTIONS em netlify/functions/recrutamentos.mjs.
 */
(async () => {
  'use strict';
  const { $, esc, formatDateTime, setHidden, message, can, displayName, requirePage, api } = window.Cavalaria;

  const access = await requirePage('recrutamento');
  if (!access) return;
  const canEdit = can(access, 'recrutamento.editar');

  // ---------------------------------------------------------------------------
  // Roteiro
  // ---------------------------------------------------------------------------

  const ANUNCIOS = [
    '⚠ Hoje, às 20h30 de New York, a Cavalaria do Oeste anuncia abertura de vagas para novos oficiais da lei. Aqueles que sonham em ingressar na nossa corporação e atuar servindo, protegendo e mantendo a ordem no Condado, compareçam ao Xerifado de Valentine!',
    '⚠ A hora é agora! Aliste-se na Cavalaria do Oeste: homens e mulheres estão sendo convocados para reforçar a lei. Apresentem-se no Xerifado de Valentine imediatamente!',
  ];

  const PERGUNTAS_PESSOAIS = [
    'Por que quer entrar na cavalaria?',
    'O que seus defeitos e qualidades trarão de benefício à cavalaria?',
    'Quais são seus objetivos e o que você almeja ao entrar na carreira militar?',
  ];

  const TESTES = [
    {
      campo: 'teste_caca',
      titulo: 'Caça',
      texto: 'Pedir ao candidato que realize uma caça de animal de porte médio/grande, dando-lhe um tempo hábil para a realização. Deve ser utilizada apenas uma faca.',
    },
    {
      campo: 'teste_natacao',
      titulo: 'Natação',
      texto: 'Pedir ao candidato que atravesse o lago, encoste na parede e retorne ao píer. Fingir que não viu ele fazendo a atividade e mandá-lo novamente na mesma tarefa; faça uma terceira vez se perceber algum tom de insubordinação ou reclamação.',
    },
  ];

  const QUESTIONARIO = [
    'Você acaba de chegar no departamento, bate seu ponto e entra em serviço. Nesse meio tempo, percebe uma movimentação estranha e, do lado de fora, homens com cavalos indo e vindo em frente ao departamento. O que você faria nessa situação?',
    'Você está em patrulhamento solo esperando outros oficiais entrarem em serviço e avista 2 indivíduos com armas nas mãos andando pela cidade. O que você faria diante dessa situação?',
    'Você vê um oficial com brincadeiras impróprias no local de trabalho, incomodando outros recrutas. Qual seria sua atitude naquele momento?',
    'Você está em uma situação de trabalho onde ocorre o sequestro de um civil. Qual seria o seu primeiro passo para resgatar o refém com vida?',
    'Simule uma abordagem de rotina, com o indivíduo utilizando máscara.',
    'Simule uma abordagem em um indivíduo utilizando armamentos ilegais/raspados.',
    'Simule uma abordagem em um indivíduo agindo de maneira agressiva e empunhando armas.',
    'Perguntas referentes às regras de maneira geral (ex.: horário de assalto, contingente mínimo para roubos etc.).',
  ];

  const PILARES = [
    ['Respeito', 'respeitar a integridade física e mental de colegas e civis, e respeitar a dignidade de detentos, dos americanos e dos animais do condado.'],
    ['Disciplina', 'ser organizado, acatar ordens, respeitar a hierarquia e ter postura da cavalaria.'],
    ['Coragem', 'ter postura, manter o emocional controlado, saber trabalhar sob pressão, não ser levado por emoção ou provocações.'],
    ['Dedicação', 'ser proativo, procurar aprender, ser esforçado e estudioso, aplicar a lei como instruído.'],
  ];

  const CONTRATACAO = [
    'Dê algema, porrete, livro e estrela. Ensine para que serve e como usar.',
    'Patentes e suas funções, armamentos e como são feitas as promoções.',
    'Uniforme e regiões (BW, NH e LM).',
    'Informes sobre o CO.',
    'Dia a dia como oficial.',
    'Postura etc.',
  ];

  const CAMPOS_PESSOAIS = [
    ['nome', 'Nome *', 80],
    ['idade', 'Idade', 10],
    ['cidade', 'Cidade', 80],
    ['ultimo_emprego', 'Último emprego', 120],
    ['ficha_suja', 'Ficha suja', 300],
  ];

  const list = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

  function renderRoteiro() {
    const step = (icon, title, body) => `<section class="script-step"><h3>${icon} ${esc(title)}</h3>${body}</section>`;
    $('tab-roteiro').innerHTML = [
      step('📄', '1. Início do recrutamento', `
        <p>🚨 <b>Anúncio para recrutamento</b> — comando <code>/anuncio</code>. Use uma das mensagens:</p>
        ${ANUNCIOS.map((a, i) => `<div class="announce"><p>${esc(a)}</p><button class="btn secondary no-print" data-copy="${i}">Copiar comando</button></div>`).join('')}
        <p>Na ficha, registre 📅 data, 👮 responsável e 👮 auxiliares.</p>`),
      step('📓', '2. Informações pessoais do candidato', `
        ${list(CAMPOS_PESSOAIS.map(([, label]) => esc(label.replace(' *', ''))))}
        <p>⏱ <b>Tempo disponível para a cavalaria:</b> a) dia de semana · b) final de semana.</p>`),
      step('🆔', '3. Conhecimento intrínseco do candidato', `
        <p>Faça perguntas a respeito do candidato, seguindo o exemplo:</p>
        ${list(['3 qualidades', '3 defeitos'])}
        <ol>${PERGUNTAS_PESSOAIS.map(q => `<li><b>Recrutador:</b> ${esc(q)}</li>`).join('')}</ol>`),
      step('🏋️', '4. Teste físico', `<ol>${TESTES.map(t => `<li><b>${esc(t.titulo)}:</b> ${esc(t.texto)}</li>`).join('')}</ol>`),
      step('⚕', '5. Questionário psicológico de conhecimento básico', `<ol>${QUESTIONARIO.map(q => `<li>${esc(q)}</li>`).join('')}</ol>`),
      step('🔍', '6. Informações', `
        <p>Informe ao candidato os <b>Quatro Pilares da Cavalaria</b>:</p>
        ${list(PILARES.map(([nome, texto]) => `<b>${esc(nome)}:</b> ${esc(texto)}`))}`),
      step('👮', '7. Contratação', `
        <p>Reúna os oficiais que participaram do recrutamento e, após avaliação, colete a opinião de quem participou para aprovação ou reprovação.</p>
        ${list(CONTRATACAO.map(i => '➡ ' + esc(i)))}`),
    ].join('');
  }

  $('tab-roteiro').addEventListener('click', async e => {
    const button = e.target.closest('[data-copy]');
    if (!button) return;
    const text = `/anuncio ${ANUNCIOS[Number(button.dataset.copy)]}`;
    try {
      await navigator.clipboard.writeText(text);
      message('Comando do anúncio copiado. Cole no chat do jogo.', 'success');
    } catch {
      message('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.', 'error');
    }
  });

  // ---------------------------------------------------------------------------
  // Abas
  // ---------------------------------------------------------------------------

  function showTab(name) {
    document.querySelectorAll('.tab').forEach(tab => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    setHidden('tab-roteiro', name !== 'roteiro');
    setHidden('tab-fichas', name !== 'fichas');
  }
  document.querySelectorAll('.tab').forEach(tab => { tab.onclick = () => showTab(tab.dataset.tab); });

  // ---------------------------------------------------------------------------
  // Fichas: lista
  // ---------------------------------------------------------------------------

  let records = [];
  let editingId = null; // null = ficha nova

  const formatDate = iso => (iso ? iso.split('-').reverse().join('/') : '—');
  const RESULT_CLASS = { Aprovado: 'ok', Reprovado: 'bad', Pendente: 'wait' };

  function renderCandidateDetail(c, i) {
    const row = (label, value) => (value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : '');
    const test = (t, label) => (t?.resultado || t?.obs ? row(label, [t.resultado, t.obs].filter(Boolean).join(' — ')) : '');
    const qa = (questions, answers) => questions
      .map((q, k) => (answers?.[k] ? `<div class="qa"><p class="q">${k + 1}. ${esc(q)}</p><p class="a">${esc(answers[k])}</p></div>` : ''))
      .join('');
    return `<div class="candidate-detail">
      <h4>👤 Candidato ${String(i + 1).padStart(2, '0')} — ${esc(c.nome)}
        <span class="result ${RESULT_CLASS[c.resultado] || 'wait'}">${esc(c.resultado)}${c.nota !== null && c.nota !== undefined ? ` · nota ${esc(c.nota)}` : ''}</span></h4>
      <dl class="facts">
        ${row('Idade', c.idade)}${row('Cidade', c.cidade)}${row('Último emprego', c.ultimo_emprego)}${row('Ficha suja', c.ficha_suja)}
        ${row('Disponível (semana)', c.disp_semana)}${row('Disponível (fim de semana)', c.disp_fds)}
        ${row('Qualidades', c.qualidades)}${row('Defeitos', c.defeitos)}
        ${test(c.teste_caca, 'Teste de caça')}${test(c.teste_natacao, 'Teste de natação')}
      </dl>
      ${qa(PERGUNTAS_PESSOAIS, c.respostas_pessoais)}
      ${qa(QUESTIONARIO, c.questionario)}
      ${c.observacoes ? `<div class="qa"><p class="q">Observações</p><p class="a">${esc(c.observacoes)}</p></div>` : ''}
    </div>`;
  }

  function renderRecord(r) {
    const counts = ['Aprovado', 'Reprovado', 'Pendente']
      .map(s => [s, r.candidatos.filter(c => c.resultado === s).length])
      .filter(([, n]) => n)
      .map(([s, n]) => `<span class="result ${RESULT_CLASS[s]}">${n} ${s.toLowerCase()}${n > 1 ? 's' : ''}</span>`)
      .join(' ');
    const edited = r.atualizado_em ? ` · editada em ${formatDateTime(r.atualizado_em)} por ${esc(r.atualizado_por?.nome || '')}` : '';
    const actions = canEdit
      ? `<div class="topic-actions no-print">
          <button class="btn secondary" data-action="edit">Editar</button>
          <button class="btn danger" data-action="delete">Excluir</button>
        </div>`
      : '';
    return `<article class="topic record" data-id="${esc(r.id)}">
      <h3>Recrutamento de ${esc(formatDate(r.data))}</h3>
      <p class="topic-sub">Responsável: ${esc(r.responsavel)}${r.auxiliares ? ` · Auxiliares: ${esc(r.auxiliares)}` : ''}</p>
      <p class="topic-meta">${r.candidatos.length} candidato${r.candidatos.length > 1 ? 's' : ''}: ${esc(r.candidatos.map(c => c.nome).join(', '))} · ${counts}</p>
      <p class="topic-meta">Registrada por ${esc(r.autor?.nome || '—')} em ${formatDateTime(r.criado_em)}${edited}</p>
      <details><summary>Ver ficha completa</summary>${r.candidatos.map(renderCandidateDetail).join('')}</details>
      ${actions}
    </article>`;
  }

  function renderRecords() {
    const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
    const shown = records.filter(r =>
      [r.responsavel, r.auxiliares, ...r.candidatos.map(c => c.nome)].join(' ').toLocaleLowerCase('pt-BR').includes(term));
    $('records').innerHTML = shown.length
      ? shown.map(renderRecord).join('')
      : `<div class="empty">${records.length ? 'Nenhuma ficha encontrada nesta busca.' : 'Nenhuma ficha de recrutamento registrada ainda.'}</div>`;
  }

  async function loadRecords() {
    try {
      ({ fichas: records } = await api('recrutamentos'));
      renderRecords();
    } catch (e) {
      message('Não foi possível carregar as fichas: ' + e.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Fichas: editor
  // ---------------------------------------------------------------------------

  const input = (name, label, max, value = '', extra = '') =>
    `<label class="field"><span>${esc(label)}</span><input data-f="${name}" maxlength="${max}" value="${esc(value)}" ${extra}></label>`;
  const textarea = (name, label, value = '', rows = 2) =>
    `<label class="field"><span>${label}</span><textarea data-f="${name}" rows="${rows}" maxlength="2000">${esc(value)}</textarea></label>`;
  const select = (name, label, options, value) =>
    `<label class="field"><span>${esc(label)}</span><select data-f="${name}">${options
      .map(([v, text]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;

  function candidateFields(c = {}) {
    return `
      <div class="form-grid">
        ${CAMPOS_PESSOAIS.map(([name, label, max]) => input(name, label, max, c[name], name === 'nome' ? 'required' : '')).join('')}
        ${input('disp_semana', '⏱ Disponível: dia de semana', 120, c.disp_semana)}
        ${input('disp_fds', '⏱ Disponível: final de semana', 120, c.disp_fds)}
        ${input('qualidades', '3 qualidades', 300, c.qualidades)}
        ${input('defeitos', '3 defeitos', 300, c.defeitos)}
      </div>
      <h5>🆔 Conhecimento intrínseco</h5>
      ${PERGUNTAS_PESSOAIS.map((q, k) => textarea(`respostas_pessoais.${k}`, `${k + 1}. ${esc(q)}`, c.respostas_pessoais?.[k])).join('')}
      <h5>🏋️ Teste físico</h5>
      <div class="form-grid">
        ${TESTES.map(t => `
          ${select(`${t.campo}.resultado`, t.titulo, [['', '— não avaliado —'], ['Passou', 'Passou'], ['Não passou', 'Não passou']], c[t.campo]?.resultado || '')}
          ${input(`${t.campo}.obs`, `${t.titulo}: observação`, 500, c[t.campo]?.obs)}`).join('')}
      </div>
      <h5>⚕ Questionário psicológico</h5>
      ${QUESTIONARIO.map((q, k) => textarea(`questionario.${k}`, `${k + 1}. ${esc(q)}`, c.questionario?.[k])).join('')}
      <h5>👮 Avaliação final</h5>
      <div class="form-grid">
        ${input('nota', 'Nota (0 a 10)', 4, c.nota ?? '', 'type="number" min="0" max="10" step="0.5"')}
        ${select('resultado', 'Resultado', [['Pendente', 'Pendente'], ['Aprovado', 'Aprovado'], ['Reprovado', 'Reprovado']], c.resultado || 'Pendente')}
      </div>
      ${textarea('observacoes', 'Observações', c.observacoes, 3)}`;
  }

  function renumberCandidates() {
    $('candidates').querySelectorAll('.candidate').forEach((el, i) => {
      el.querySelector('.candidate-title').textContent = `👤 Candidato ${String(i + 1).padStart(2, '0')}`;
    });
  }

  function addCandidate(c = {}) {
    const el = document.createElement('details');
    el.className = 'candidate';
    el.open = true;
    el.innerHTML = `<summary><span class="candidate-title"></span>
        <button class="btn danger no-print" type="button" data-remove>Remover</button></summary>
      ${candidateFields(c)}`;
    el.querySelector('[data-remove]').onclick = e => {
      e.preventDefault();
      if ($('candidates').children.length === 1) {
        message('A ficha precisa de pelo menos um candidato.', 'error');
        return;
      }
      if (!confirm('Remover este candidato da ficha?')) return;
      el.remove();
      renumberCandidates();
    };
    $('candidates').appendChild(el);
    renumberCandidates();
  }

  // Lê um candidato do formulário no formato que a Function espera.
  function readCandidate(el) {
    const c = { respostas_pessoais: [], questionario: [], teste_caca: {}, teste_natacao: {} };
    el.querySelectorAll('[data-f]').forEach(field => {
      const [key, sub] = field.dataset.f.split('.');
      if (sub === undefined) c[key] = field.value;
      else if (Array.isArray(c[key])) c[key][Number(sub)] = field.value;
      else c[key][sub] = field.value;
    });
    return c;
  }

  function openEditor(record = null) {
    editingId = record?.id || null;
    $('editorTitle').textContent = record ? 'Editar ficha de recrutamento' : 'Nova ficha de recrutamento';
    $('recData').value = record?.data || new Date().toISOString().slice(0, 10);
    $('recResponsavel').value = record?.responsavel || displayName(access.user);
    $('recAuxiliares').value = record?.auxiliares || '';
    $('candidates').innerHTML = '';
    (record?.candidatos?.length ? record.candidatos : [{}]).forEach(addCandidate);
    setHidden('editor', false);
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeEditor() {
    editingId = null;
    $('recordForm').reset();
    $('candidates').innerHTML = '';
    setHidden('editor', true);
  }

  $('recordForm').addEventListener('submit', async e => {
    e.preventDefault();
    const button = $('saveRecord');
    const payload = {
      data: $('recData').value,
      responsavel: $('recResponsavel').value,
      auxiliares: $('recAuxiliares').value,
      candidatos: [...$('candidates').querySelectorAll('.candidate')].map(readCandidate),
    };
    button.disabled = true;
    try {
      if (editingId) await api('recrutamentos', 'POST', { acao: 'editar', id: editingId, ...payload });
      else await api('recrutamentos', 'POST', { acao: 'criar', ...payload });
      message(editingId ? 'Ficha atualizada.' : 'Ficha de recrutamento salva.', 'success');
      closeEditor();
      await loadRecords();
    } catch (err) {
      message('Não foi possível salvar a ficha: ' + err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('records').addEventListener('click', async e => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const record = records.find(r => r.id === button.closest('[data-id]').dataset.id);
    if (!record) return;
    if (button.dataset.action === 'edit') {
      openEditor(record);
      return;
    }
    if (!confirm(`Excluir a ficha do recrutamento de ${formatDate(record.data)}? Essa ação não pode ser desfeita.`)) return;
    button.disabled = true;
    try {
      await api('recrutamentos', 'POST', { acao: 'excluir', id: record.id });
      message('Ficha excluída.', 'success');
      if (editingId === record.id) closeEditor();
      await loadRecords();
    } catch (err) {
      message('Não foi possível excluir: ' + err.message, 'error');
      button.disabled = false;
    }
  });

  $('newRecord').onclick = () => openEditor();
  $('addCandidate').onclick = () => addCandidate();
  $('cancelRecord').onclick = closeEditor;
  $('search').addEventListener('input', renderRecords);

  renderRoteiro();
  setHidden('newRecord', !canEdit);
  setHidden('private', false);
  await loadRecords();
})();
