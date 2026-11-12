import { ragClient } from './rag';
import type { ExecutionPlan } from './document-agent.types';

export interface SkillParameter {
  name: string;
  label: string;
  required: boolean;
}
export interface WritingSkillSummary {
  skill_id: string;
  name: string;
  description: string;
  revision: number;
  builtin?: boolean;
  enabled?: boolean;
}
export interface WritingSkillDefinition {
  workflow?: 'standard' | 'research_writing';
  name: string;
  description: string;
  parameters: SkillParameter[];
  steps: ExecutionPlan['steps'];
  allowed_tools: string[];
  acceptance: string[];
  template_id?: string;
  enabled: boolean;
}
export interface WritingSkill extends WritingSkillDefinition {
  skill_id: string;
  revision: number;
  builtin?: boolean;
}
export interface SkillSelection {
  skill: WritingSkill;
  inputs: Record<string, string>;
}
export const listWritingSkills = async (): Promise<WritingSkillSummary[]> =>
  (await ragClient.get('/ai/skills')).data;
export const getWritingSkill = async (id: string): Promise<WritingSkill> =>
  (await ragClient.get(`/ai/skills/${encodeURIComponent(id)}`)).data;
export const saveWritingSkill = async (
  definition: WritingSkillDefinition,
  id?: string,
  revision?: number,
): Promise<WritingSkill> =>
  (id
    ? await ragClient.patch(`/ai/skills/${encodeURIComponent(id)}`, {
        ...definition,
        expected_revision: revision,
      })
    : await ragClient.post('/ai/skills', definition)
  ).data;
export const deleteWritingSkill = async (id: string, revision: number) =>
  (
    await ragClient.delete(`/ai/skills/${encodeURIComponent(id)}`, {
      data: { expected_revision: revision },
    })
  ).data;
