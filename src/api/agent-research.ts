/**
 * @file 研究进度 API。读取图任务的研究说明、来源覆盖和章节进度。
 */
import { ragClient } from './rag';
export interface ResearchBrief {
  goal: string;
  audience: string;
  deliverable: string;
  constraints: string[];
  unknowns: string[];
  preferred_sources: string[];
  questions: { id: string; text: string; section_ids: string[] }[];
  sections: { id: string; title: string; question_ids: string[] }[];
}
export interface ResearchCoverage {
  candidate_version: number;
  deliverable: boolean;
  completeness: 'complete' | 'partial';
  items: {
    question_id: string;
    status: 'covered' | 'partial' | 'missing' | 'conflicted';
    locations: {
      field: 'markdown' | 'answer' | 'edit';
      edit_id?: string;
      start: number;
      end: number;
    }[];
    citation_ids: string[];
    reason: string;
    gap_declared: boolean;
  }[];
}
export interface ResearchNote {
  question_id: string;
  task_id: string;
  findings: { statement: string; evidence_ids: string[] }[];
  missing: string[];
  conflicts: { description: string; evidence_ids: string[] }[];
}
export interface ResearchDetails {
  brief: ResearchBrief | null;
  coverage: ResearchCoverage | null;
  notes: ResearchNote[];
  total: number;
  next_offset: number | null;
}
/**
 * 读取指定图任务的研究说明、笔记和覆盖进度。
 *
 * @param runId run 对应的唯一标识。
 * @param questionId question 对应的唯一标识（可选）。
 * @param offset 从原文或分页数据的哪个位置开始读取。
 * @returns 研究说明、覆盖检查结果及当前页的研究笔记。
 */
export async function getAgentResearch(
  runId: string,
  questionId?: string,
  offset = 0,
): Promise<ResearchDetails> {
  return (
    await ragClient.get(
      `/ai/agent/runs/${encodeURIComponent(runId)}/research`,
      {
        params: {
          ...(questionId ? { question_id: questionId } : {}),
          offset,
          limit: 10,
        },
      },
    )
  ).data;
}
