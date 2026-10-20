import { ragClient } from './rag';
export interface NoteCategory {
  category_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  deleted_at?: string | null;
  delete_batch_id?: string | null;
  delete_reason?: string | null;
}
export interface NoteTemplate {
  template_id: string;
  name: string;
  description: string;
  markdown: string;
  instructions: string;
  revision: number;
  builtin?: boolean;
}
export interface CategoryTree {
  revision: number;
  items: NoteCategory[];
  counts: Record<string, number>;
}
export const getCategoryTree = async (): Promise<CategoryTree> =>
  (await ragClient.get('/categories/tree')).data;
export const categoryMutation = async (
  path: string,
  input: Record<string, unknown>,
  method: 'post' | 'patch' = 'post',
) => (await ragClient[method](`/categories${path}`, input)).data;
export const getTemplates = async (): Promise<NoteTemplate[]> =>
  (await ragClient.get('/note-templates')).data;
export const saveTemplate = async (
  input: Partial<NoteTemplate> & { expected_revision?: number },
  id?: string,
) =>
  (id
    ? await ragClient.patch(`/note-templates/${id}`, input)
    : await ragClient.post('/note-templates', input)
  ).data;
export const deleteTemplate = async (id: string) =>
  (await ragClient.delete(`/note-templates/${id}`)).data;
export const getTrash = async (type: 'document' | 'category') =>
  (await ragClient.get('/trash', { params: { type } })).data;
export const trashMutation = async (
  action: 'restore' | 'purge',
  input: Record<string, unknown>,
) => (await ragClient.post(`/trash/${action}`, input)).data;
