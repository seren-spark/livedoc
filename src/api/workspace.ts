/**
 * @file 工作空间 API。封装分类、模板和回收站的查询与修改请求。
 */
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
/**
 * 读取当前用户的分类树与版本。
 *
 * @returns CategoryTree 类型的处理结果。
 */
export const getCategoryTree = async (): Promise<CategoryTree> =>
  (await ragClient.get('/categories/tree')).data;
/**
 * 提交分类创建、移动、合并等操作，并携带当前树版本。
 *
 * @param path 目标文件路径或节点层级路径。
 * @param input 本次操作的输入数据。
 * @param method HTTP 请求方法。
 * @returns any 类型的处理结果。
 */
export const categoryMutation = async (
  path: string,
  input: Record<string, unknown>,
  method: 'post' | 'patch' = 'post',
) => (await ragClient[method](`/categories${path}`, input)).data;
/**
 * 读取当前用户可用的写作模板。
 *
 * @returns 整理后的结果列表。
 */
export const getTemplates = async (): Promise<NoteTemplate[]> =>
  (await ragClient.get('/note-templates')).data;
/**
 * 校验模板输入与版本后保存模板。
 *
 * @param input 本次操作的输入数据。
 * @param id 目标记录的唯一标识（可选）。
 * @returns any 类型的处理结果。
 */
export const saveTemplate = async (
  input: Partial<NoteTemplate> & { expected_revision?: number },
  id?: string,
) =>
  (id
    ? await ragClient.patch(`/note-templates/${id}`, input)
    : await ragClient.post('/note-templates', input)
  ).data;
/**
 * 删除当前用户有权管理的写作模板。
 *
 * @param id 目标记录的唯一标识。
 * @returns any 类型的处理结果。
 */
export const deleteTemplate = async (id: string) =>
  (await ragClient.delete(`/note-templates/${id}`)).data;
/**
 * 读取回收站中的分类和文档。
 *
 * @param type 当前数据或节点类型。
 * @returns any 类型的处理结果。
 */
export const getTrash = async (type: 'document' | 'category') =>
  (await ragClient.get('/trash', { params: { type } })).data;
/**
 * 提交回收、恢复或彻底删除操作。
 *
 * @param action 本次请求执行的操作类型。
 * @param input 本次操作的输入数据。
 * @returns any 类型的处理结果。
 */
export const trashMutation = async (
  action: 'restore' | 'purge',
  input: Record<string, unknown>,
) => (await ragClient.post(`/trash/${action}`, input)).data;
