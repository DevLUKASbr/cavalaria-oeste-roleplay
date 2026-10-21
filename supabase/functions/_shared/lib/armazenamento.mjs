/*
 * Armazenamento compartilhado da API: cada registro (tópico, ficha…) é um arquivo JSON
 * no Supabase Storage, bucket privado "cavalaria", numa pasta por assunto. O bucket é criado
 * automaticamente na primeira gravação. Só as Functions acessam, com a chave secreta.
 */
import { HttpError } from './acesso.mjs';

const BUCKET = 'cavalaria';
export const ID_RE = /^[a-z0-9-]{6,40}$/;
export const newId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------------------
// Supabase Storage: um arquivo JSON por registro, numa pasta do bucket
// ---------------------------------------------------------------------------

export function storage(sb, folder, { paginated = false, strict = false } = {}) {
  const objectPath = id => `/storage/v1/object/${BUCKET}/${folder}/${id}.json`;
  const isMissingBucket = async response =>
    !response.ok && /bucket not found/i.test(await response.clone().text());

  async function failure(response) {
    const data = await response.json().catch(() => ({}));
    return new HttpError(502, `Supabase Storage: ${data.message || data.error || response.statusText}`);
  }

  async function createBucket() {
    const response = await sb.call('/storage/v1/bucket', {
      method: 'POST',
      body: { id: BUCKET, name: BUCKET, public: false },
      raw: true,
    });
    if (response.ok) return;
    // 409/400 "already exists" = outra chamada criou ao mesmo tempo; tudo bem.
    const detail = await response.text();
    if (!/already exists|duplicate/i.test(detail)) throw new HttpError(502, `Supabase Storage: ${detail.slice(0, 200)}`);
  }

  return {
    async list() {
      if (paginated) {
        const ids = new Set();
        for (let offset = 0; ; offset += 1000) {
          const response = await sb.call(`/storage/v1/object/list/${BUCKET}`, {
            method: 'POST', body: { prefix: folder, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }, raw: true,
          });
          if (offset === 0 && await isMissingBucket(response)) return [];
          if (!response.ok) throw await failure(response);
          const files = await response.json();
          for (const file of files) if (file.name?.endsWith('.json') && ID_RE.test(file.name.slice(0, -5))) ids.add(file.name.slice(0, -5));
          if (files.length < 1000) break;
        }
        const result = [], keys = [...ids];
        // Conter o paralelismo ao ler livros maiores, sem truncar os relatórios em 1.000 arquivos.
        for (let i = 0; i < keys.length; i += 8) {
          const batch = await Promise.all(keys.slice(i, i + 8).map(id => this.get(id)));
          if (strict && batch.some(item => !item)) throw new HttpError(502, 'Não foi possível ler todas as ações. Atualize o livro para tentar novamente.');
          result.push(...batch);
        }
        return result;
      }
      const response = await sb.call(`/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        body: { prefix: folder, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } },
        raw: true,
      });
      if (await isMissingBucket(response)) return []; // nada gravado ainda
      if (!response.ok) throw await failure(response);
      const files = await response.json();
      const ids = files.map(f => f.name).filter(n => n.endsWith('.json')).map(n => n.slice(0, -5)).filter(id => ID_RE.test(id));
      return Promise.all(ids.map(id => this.get(id)));
    },

    async get(id) {
      const response = await sb.call(objectPath(id), { raw: true });
      if (!response.ok) {
        if (strict && response.status !== 404) throw await failure(response);
        return null;
      }
      const item = await response.json().catch(() => null);
      if (strict && !item) throw new HttpError(502, 'Um registro de ação está ilegível. Solicite revisão à liderança.');
      return item;
    },

    async put(record) {
      const save = () => sb.call(objectPath(record.id), {
        method: 'POST',
        body: JSON.stringify(record),
        headers: { 'x-upsert': 'true', 'cache-control': 'no-cache' },
        raw: true,
      });
      let response = await save();
      if (await isMissingBucket(response)) {
        await createBucket();
        response = await save();
      }
      if (!response.ok) throw await failure(response);
    },

    async remove(id) {
      const response = await sb.call(`/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        body: { prefixes: [`${folder}/${id}.json`] },
        raw: true,
      });
      if (!response.ok) throw await failure(response);
    },
  };
}
