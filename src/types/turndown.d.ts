/**
 * @file Turndown 类型补充。为 HTML 转 Markdown 库补充项目需要的类型声明。
 */
declare module 'turndown' {
  export default class TurndownService {
    constructor(options?: Record<string, unknown>);
    addRule(
      key: string,
      rule: {
        filter: string | string[] | ((node: HTMLElement) => boolean);
        replacement: (content: string, node: HTMLElement) => string;
      },
    ): this;
    turndown(input: string | HTMLElement): string;
  }
}
