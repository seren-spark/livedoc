import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AgentResearchProgress from './AgentResearchProgress';
describe('research writing progress', () => {
  it('separates partially satisfied requirements from fact verification and adoption', () => {
    const html = renderToStaticMarkup(
      <AgentResearchProgress
        runId="run"
        coverage={{
          candidate_version: 1,
          deliverable: true,
          completeness: 'partial',
          items: [
            {
              question_id: 'q1',
              status: 'missing',
              locations: [],
              citation_ids: [],
              reason: '未找到实际案例',
              gap_declared: true,
            },
          ],
        }}
      />,
    );
    expect(html).toContain('部分满足，含资料缺口');
    expect(html).toContain('未找到实际案例');
    expect(html).not.toContain('已采纳');
    expect(html).not.toContain('事实核验通过');
  });
  it('renders all search tasks and their stopping reasons without source HTML execution', () => {
    const html = renderToStaticMarkup(
      <AgentResearchProgress
        runId="run"
        progress={{
          a: { searches: 3, stop_reason: 'search_limit' },
          b: { searches: 2, stop_reason: 'no_new_evidence' },
        }}
        brief={{
          goal: '<img src=x>',
          audience: '',
          deliverable: '文章',
          constraints: [],
          unknowns: [],
          preferred_sources: [],
          questions: [],
          sections: [],
        }}
      />,
    );
    expect(html).toContain('已搜索 3/3 次');
    expect(html).toContain('连续两次没有新增证据');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img');
  });
});
