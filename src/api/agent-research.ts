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
