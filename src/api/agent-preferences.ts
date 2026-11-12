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
export const getWritingPreferences =
  async (): Promise<WritingPreferencesState> =>
    (await ragClient.get('/ai/agent/preferences')).data;
export const mutateWritingPreference = async (
  input: PreferenceMutation,
): Promise<WritingPreferencesState> =>
  (await ragClient.post('/ai/agent/preferences', input)).data;
