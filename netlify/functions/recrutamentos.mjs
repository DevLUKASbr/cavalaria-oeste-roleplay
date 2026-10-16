/*
 * Netlify Function: fichas de recrutamento (rota /api/recrutamentos).
 *
 *   GET  → lista de fichas, mais recentes primeiro                    (permissão 'recrutamento')
 *   POST { acao: 'criar',   data, responsavel, auxiliares, candidatos[] }      ('recrutamento.editar')
 *   POST { acao: 'editar',  id, data, responsavel, auxiliares, candidatos[] }  ('recrutamento.editar')
 *   POST { acao: 'excluir', id }                                               ('recrutamento.editar')
 *
 * Uma ficha = um recrutamento (data, responsável, auxiliares) com um ou mais candidatos.
 * As perguntas ficam no site (site/recrutamento.js); aqui só se guardam as respostas, na ordem.
 * Sem SQL: cada ficha é um arquivo JSON no Supabase Storage, pasta "recrutamentos/".
 */
import { HttpError, json, respond, supabase, authenticate } from '../lib/acesso.mjs';
import { storage, ID_RE, newId } from '../lib/armazenamento.mjs';

const FOLDER = 'recrutamentos';
const MAX_CANDIDATES = 20;
const PERSONAL_QUESTIONS = 3;
const PSYCH_QUESTIONS = 8;
const TEST_RESULTS = ['', 'Passou', 'Não passou'];
const FINAL_RESULTS = ['Pendente', 'Aprovado', 'Reprovado'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function str(value, max, label) {
  const clean = String(value ?? '').trim();
  if (clean.length > max) throw new HttpError(400, `${label}: no máximo ${max} caracteres.`);
  return clean;
}

function oneOf(value, allowed, label) {
  const clean = String(value ?? '');
  if (!allowed.includes(clean)) throw new HttpError(400, `${label}: valor inválido.`);
  return clean;
}

function answers(list, size, label) {
  const values = Array.isArray(list) ? list : [];
  return Array.from({ length: size }, (_, i) => str(values[i], 2000, `${label} ${i + 1}`));
}

function cleanTest(test, label) {
  return {
    resultado: oneOf(test?.resultado ?? '', TEST_RESULTS, label),
    obs: str(test?.obs, 500, `${label} (observação)`),
  };
}

function cleanGrade(nota) {
  if (nota === null || nota === undefined || nota === '') return null;
  const value = Number(nota);
  if (!Number.isFinite(value) || value < 0 || value > 10) throw new HttpError(400, 'A nota vai de 0 a 10.');
  return Math.round(value * 10) / 10;
}

function cleanCandidate(c, index) {
  const n = `Candidato ${index + 1}`;
  const nome = str(c?.nome, 80, `${n}: nome`);
  if (!nome) throw new HttpError(400, `${n}: informe o nome.`);
  return {
    nome,
    idade: str(c?.idade, 10, `${n}: idade`),
    cidade: str(c?.cidade, 80, `${n}: cidade`),
    ultimo_emprego: str(c?.ultimo_emprego, 120, `${n}: último emprego`),
    ficha_suja: str(c?.ficha_suja, 300, `${n}: ficha suja`),
    disp_semana: str(c?.disp_semana, 120, `${n}: disponibilidade (semana)`),
    disp_fds: str(c?.disp_fds, 120, `${n}: disponibilidade (fim de semana)`),
    qualidades: str(c?.qualidades, 300, `${n}: qualidades`),
    defeitos: str(c?.defeitos, 300, `${n}: defeitos`),
    respostas_pessoais: answers(c?.respostas_pessoais, PERSONAL_QUESTIONS, `${n}: pergunta pessoal`),
    teste_caca: cleanTest(c?.teste_caca, `${n}: teste de caça`),
    teste_natacao: cleanTest(c?.teste_natacao, `${n}: teste de natação`),
    questionario: answers(c?.questionario, PSYCH_QUESTIONS, `${n}: questão`),
    nota: cleanGrade(c?.nota),
    resultado: oneOf(c?.resultado ?? 'Pendente', FINAL_RESULTS, `${n}: resultado`),
    observacoes: str(c?.observacoes, 2000, `${n}: observações`),
  };
}

function cleanRecordFields(body) {
  const data = String(body.data ?? '');
  if (!DATE_RE.test(data) || Number.isNaN(Date.parse(data))) throw new HttpError(400, 'Informe a data do recrutamento.');
  const responsavel = str(body.responsavel, 80, 'Responsável');
  if (!responsavel) throw new HttpError(400, 'Informe o responsável pelo recrutamento.');
  const candidatos = Array.isArray(body.candidatos) ? body.candidatos : [];
  if (!candidatos.length) throw new HttpError(400, 'Adicione pelo menos um candidato.');
  if (candidatos.length > MAX_CANDIDATES) throw new HttpError(400, `No máximo ${MAX_CANDIDATES} candidatos por ficha.`);
  return {
    data,
    responsavel,
    auxiliares: str(body.auxiliares, 300, 'Auxiliares'),
    candidatos: candidatos.map(cleanCandidate),
  };
}

function cleanId(id) {
  const value = String(id ?? '');
  if (!ID_RE.test(value)) throw new HttpError(400, 'Ficha não informada.');
  return value;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default req => respond(async () => {
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');

  const sb = supabase();
  const caller = await authenticate(req, sb);
  if (!caller.can('recrutamento')) throw new HttpError(403, 'Sem permissão para ver os recrutamentos.');
  const store = storage(sb, FOLDER);

  if (req.method === 'GET') {
    const records = (await store.list()).filter(Boolean);
    records.sort((a, b) => `${b.data}${b.criado_em}`.localeCompare(`${a.data}${a.criado_em}`));
    return json(200, { fichas: records });
  }

  if (!caller.can('recrutamento.editar')) throw new HttpError(403, 'Sua conta não pode criar ou alterar fichas.');
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const author = { id: caller.user.id, nome: caller.nome };

  switch (body.acao) {
    case 'criar': {
      const record = { id: newId(), ...cleanRecordFields(body), autor: author, criado_em: now, atualizado_em: null, atualizado_por: null };
      await store.put(record);
      return json(201, { ficha: record });
    }
    case 'editar': {
      const id = cleanId(body.id);
      const current = await store.get(id);
      if (!current) throw new HttpError(404, 'Ficha não encontrada (talvez tenha sido excluída).');
      const record = { ...current, ...cleanRecordFields(body), id, atualizado_em: now, atualizado_por: author };
      await store.put(record);
      return json(200, { ficha: record });
    }
    case 'excluir': {
      await store.remove(cleanId(body.id));
      return json(200, { ok: true });
    }
    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
});

export const config = { path: '/api/recrutamentos' };
