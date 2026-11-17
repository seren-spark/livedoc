/**
 * @file 写作偏好 API。读取和修改个人写作偏好。
 */
import { ragClient } from './rag';

export interface WritingPreference {
  id: string;
  text: string;
  status: 'confirmed' | 'pending' | 'rejected';
  source: {
    kind: 'user_input' | 'manual';
    input_id: string;
    quote: string;
  };
  conflicts_with?: string[];
  created_at: string;
  updated_at: string;
}
export interface WritingPreferencesState {
  revision: number;
  items: WritingPreference[];
}
export interface PreferenceMutation {
  request_id: string;
  expected_revision: number;
  action: 'save' | 'confirm' | 'reject' | 'update' | 'delete';
  id?: string;
  text?: string;
  replace_ids?: string[];
}
/**
 * 读取当前用户保存的写作偏好。
 *
 * @returns 当前用户的偏好条目及修订号。
 */
export const getWritingPreferences =
  async (): Promise<WritingPreferencesState> =>
    (await ragClient.get('/ai/agent/preferences')).data;
/**
 * 提交写作偏好变更及期望版本。
 *
 * @param input 本次操作的输入数据。
 * @returns 本次修改后的偏好状态。
 */
export const mutateWritingPreference = async (
  input: PreferenceMutation,
): Promise<WritingPreferencesState> =>
  (await ragClient.post('/ai/agent/preferences', input)).data;
