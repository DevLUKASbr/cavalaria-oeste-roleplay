/* Gestão de contas (somente acesso total). Toda alteração passa pela Netlify Function /api/contas. */
(async () => {
  'use strict';
  const { $, esc, formatDateTime, setHidden, message, config, displayName, CARGOS, cargoLabel, loginEmail, requireMember, api, signOut } = window.Cavalaria;

  const access = await requireMember({ adminOnly: true });
  if (!access) return;

  // Todos os cargos têm acesso total por enquanto; "Sem acesso" bloqueia a conta.
  // Cargo fora da lista (conta antiga) aparece como "(atual)" e não muda se a pessoa só salvar o nome.
  const KEEP = '__atual';
  function cargoOptions(selected, { allowNone }) {
    const current = selected || '';
    const options = [
      ...(allowNone ? [['', 'Sem acesso']] : []),
      ...(current && !CARGOS.includes(current) ? [[KEEP, `${current} (atual)`]] : []),
      ...CARGOS.map(c => [c, c]),
    ];
    const chosen = CARGOS.includes(current) || !current ? current : KEEP;
    return options
      .map(([value, label]) => `<option value="${esc(value)}" ${value === chosen ? 'selected' : ''}>${esc(label)}</option>`)
      .join('');
  }
  const myId = access.session.user.id;
  let accounts = [];

  // Contas "@loginDomain" aparecem só pelo usuário, como o oficial digita no login.
  function loginLabel(email) {
    const suffix = '@' + config.loginDomain;
    return config.loginDomain && email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
  }

  function generatePassword() {
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  function showCredential(login, password, title) {
    $('credential').innerHTML = `<b>${esc(title)}</b><br>Usuário: <code>${esc(login)}</code> · Senha temporária: <code>${esc(password)}</code><br>`
      + '<span class="small">Anote agora e passe ao oficial em particular — a senha não volta a ser exibida.</span>';
    setHidden('credential', false);
  }

  function render() {
    const sorted = [...accounts].sort((a, b) =>
      (a.cargo ? 0 : 1) - (b.cargo ? 0 : 1) || (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
    const active = accounts.filter(a => a.cargo).length;
    $('counter').textContent = `${active} com acesso · ${accounts.length} no total`;
    $('accounts').innerHTML = sorted.map((a, i) => {
      const isMe = a.id === myId;
      return `<tr data-id="${esc(a.id)}" class="${a.cargo ? '' : 'no-access'}">
        <td>${i + 1}</td>
        <td><input data-field="nome" maxlength="80" value="${esc(a.nome)}" placeholder="Sem nome" aria-label="Nome de ${esc(a.email)}">${isMe ? '<span class="tag-me">você</span>' : ''}</td>
        <td class="name">${esc(loginLabel(a.email))}</td>
        <td><select data-field="cargo" aria-label="Cargo de ${esc(a.email)}">${cargoOptions(a.cargo, { allowNone: !isMe })}</select></td>
        <td class="small">${formatDateTime(a.ultimo_acesso)}</td>
        <td><div class="row-actions">
          <button class="btn" data-action="save">Salvar</button>
          <button class="btn secondary" data-action="reset">Nova senha</button>
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Nenhuma conta cadastrada.</td></tr>';
  }

  async function load() {
    try {
      ({ contas: accounts } = await api('GET'));
      render();
    } catch (e) {
      message('Não foi possível carregar as contas: ' + e.message, 'error');
    }
  }

  $('generate').onclick = () => { $('newPassword').value = generatePassword(); };

  $('createForm').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.target.querySelector('button[type="submit"]');
    const email = loginEmail($('newLogin').value);
    const password = $('newPassword').value;
    button.disabled = true;
    try {
      await api('POST', { acao: 'criar', email, nome: $('newName').value.trim(), cargo: $('newCargo').value, senha: password });
      showCredential(loginLabel(email), password, `Conta de ${$('newName').value.trim()} criada.`);
      message('Conta criada com sucesso.', 'success');
      $('createForm').reset();
      await load();
    } catch (err) {
      message('Não foi possível criar a conta: ' + err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('accounts').addEventListener('click', async e => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const row = button.closest('tr[data-id]');
    const account = accounts.find(a => a.id === row.dataset.id);
    if (!account) return;

    if (button.dataset.action === 'save') {
      const nome = row.querySelector('[data-field="nome"]').value.trim();
      const selected = row.querySelector('[data-field="cargo"]').value;
      const cargo = selected === KEEP ? undefined : (selected || null); // undefined = manter o cargo atual
      if (cargo === null && account.cargo && !confirm(`Tirar o acesso de ${account.nome || account.email} ao site?`)) return;
      button.disabled = true;
      try {
        await api('POST', { acao: 'editar', id: account.id, nome, cargo });
        message(`${nome || account.email}: alterações salvas.`, 'success');
        await load();
      } catch (err) {
        message('Não foi possível salvar: ' + err.message, 'error');
        button.disabled = false;
      }
      return;
    }

    if (!confirm(`Gerar uma nova senha temporária para ${account.nome || account.email}? A senha atual deixa de funcionar.`)) return;
    const password = generatePassword();
    button.disabled = true;
    try {
      await api('POST', { acao: 'senha', id: account.id, senha: password });
      showCredential(loginLabel(account.email), password, `Nova senha de ${account.nome || account.email}.`);
      message('Senha redefinida.', 'success');
    } catch (err) {
      message('Não foi possível redefinir a senha: ' + err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('logout').onclick = signOut;
  $('userLabel').textContent = displayName(access.session.user);
  $('roleLabel').textContent = cargoLabel(access.session.user, access.membership);
  $('newCargo').innerHTML = cargoOptions('Xerife', { allowNone: false });
  setHidden('private', false);
  await load();
})();
