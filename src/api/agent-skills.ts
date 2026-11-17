/**
 * @file 写作技能 API。管理技能定义、参数及选择结果。
 */
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
/**
 * 查询可选的内置与个人写作技能。
 *
 * @returns 整理后的结果列表。
 */
export const listWritingSkills = async (): Promise<WritingSkillSummary[]> =>
  (await ragClient.get('/ai/skills')).data;
/**
 * 读取指定写作技能的完整定义。
 *
 * @param id 目标记录的唯一标识。
 * @returns WritingSkill 类型的处理结果。
 */
export const getWritingSkill = async (id: string): Promise<WritingSkill> =>
  (await ragClient.get(`/ai/skills/${encodeURIComponent(id)}`)).data;
/**
 * 创建或更新个人技能，并提交版本校验信息。
 *
 * @param definition 写作技能或模板的完整定义。
 * @param id 目标记录的唯一标识（可选）。
 * @param revision 调用方读取到的状态修订号（可选）。
 * @returns WritingSkill 类型的处理结果。
 */
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
/**
 * 删除指定的个人写作技能。
 *
 * @param id 目标记录的唯一标识。
 * @param revision 调用方读取到的状态修订号。
 * @returns any 类型的处理结果。
 */
export const deleteWritingSkill = async (id: string, revision: number) =>
  (
    await ragClient.delete(`/ai/skills/${encodeURIComponent(id)}`, {
      data: { expected_revision: revision },
    })
  ).data;
