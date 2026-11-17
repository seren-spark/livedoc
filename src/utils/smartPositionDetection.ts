/**
 * @file 编辑位置识别。分析光标、当前段落及前后文，确定 AI 辅助写作的作用范围。
 */
export class SmartPositionDetection {
  // 智能检测最佳插入位置
  /**
   * 智能检测最佳插入位置
   *
   * @param editor 当前 TipTap 编辑器实例。
   * @returns 计算得到的数值。
   */
  static detectBestInsertionPoint(editor: any): number {
    const { from } = editor.state.selection;
    const doc = editor.state.doc;

    // 获取当前段落
    const $from = doc.resolve(from);
    const paragraph = $from.parent;

    // 检测段落中的关键位置
    const text = paragraph.textContent;
    const positions = this.findKeyPositions(text, from);

    // 返回最合适的位置
    return positions.length > 0 ? positions[0] : from;
  }

  // 查找关键位置
  /**
   * 查找关键位置
   *
   * @param text 待处理的文本。
   * @param currentPos 当前节点或光标对应的位置。
   * @returns 计算得到的数值向量或评分列表。
   */
  private static findKeyPositions(text: string, currentPos: number): number[] {
    const positions: number[] = [];

    // 查找句子边界
    const sentenceEndings = /[.!?。！？]/g;
    let match;
    while ((match = sentenceEndings.exec(text)) !== null) {
      const pos = match.index + 1;
      if (Math.abs(pos - currentPos) < 50) {
        // 只考虑距离当前位置较近的位置
        positions.push(pos);
      }
    }

    // 查找逗号位置
    const commas = /[,，]/g;
    while ((match = commas.exec(text)) !== null) {
      const pos = match.index + 1;
      if (Math.abs(pos - currentPos) < 30) {
        positions.push(pos);
      }
    }

    // 按距离排序，返回最近的位置
    return positions.sort(
      (a, b) => Math.abs(a - currentPos) - Math.abs(b - currentPos),
    );
  }

  // 获取上下文信息
  /**
   * 获取上下文信息
   *
   * @param editor 当前 TipTap 编辑器实例。
   * @param position 待查询或映射的文档位置。
   * @returns 整理后的状态与操作结果对象。
   */
  static getContextInfo(editor: any, position: number) {
    const doc = editor.state.doc;
    const fullText = doc.textContent;

    return {
      prefix: fullText.substring(0, position),
      suffix: fullText.substring(position),
      fullText,
      wordCount: fullText.length,
      paragraph: this.getCurrentParagraph(editor, position),
      surroundingText: this.getSurroundingText(editor, position, 50),
    };
  }

  /**
   * 读取光标所在段落的内容与文档位置。
   *
   * @param editor 当前 TipTap 编辑器实例。
   * @param position 待查询或映射的文档位置。
   * @returns 本次操作整理后的结果。
   */
  private static getCurrentParagraph(editor: any, position: number) {
    const $from = editor.state.doc.resolve(position);
    return $from.parent.textContent;
  }

  /**
   * 提取光标前后限定范围内的文本上下文。
   *
   * @param editor 当前 TipTap 编辑器实例。
   * @param position 待查询或映射的文档位置。
   * @param radius 当前页前后保留或预加载的范围。
   * @returns 本次操作整理后的结果。
   */
  private static getSurroundingText(
    editor: any,
    position: number,
    radius: number,
  ) {
    const fullText = editor.getText();
    const start = Math.max(0, position - radius);
    const end = Math.min(fullText.length, position + radius);
    return fullText.substring(start, end);
  }
}
