/**
 * @file AI 候选事件总线。维护当前补全候选并通知订阅组件刷新展示。
 */
type SuggestionMode = 'insert' | 'replace' | 'replace_all';

export interface AISuggestion {
  id: string;
  text: string;
  mode: SuggestionMode;
  // insert at a position (used when mode === 'insert')
  position?: number;
  // replace range (used when mode === 'replace')
  range?: { from: number; to: number };
}

type Listener = (s: AISuggestion | null) => void;

export class AISuggestionBus {
  private static instance: AISuggestionBus | null = null;
  private current: AISuggestion | null = null;
  private listeners = new Set<Listener>();

  /**
   * 返回共享候选总线的单例实例。
   *
   * @returns AISuggestionBus 类型的处理结果。
   */
  static getInstance(): AISuggestionBus {
    if (!AISuggestionBus.instance) {
      AISuggestionBus.instance = new AISuggestionBus();
    }
    return AISuggestionBus.instance;
  }

  /**
   * 读取当前候选，未显示候选时返回空状态。
   *
   * @returns AISuggestion 类型的处理结果。
   */
  get(): AISuggestion | null {
    return this.current;
  }

  /**
   * 保存当前 AI 候选并通知订阅者展示。
   *
   * @param suggestion 当前展示或待采纳的 AI 补全候选。
   */
  show(suggestion: AISuggestion) {
    this.current = suggestion;
    this.emit();
  }

  /**
   * 清空当前 AI 候选并通知订阅者。
   */
  clear() {
    this.current = null;
    this.emit();
  }

  /**
   * 注册状态变化监听，并返回取消订阅函数。
   *
   * @param listener 状态变化时调用的订阅处理函数。
   * @returns 供后续操作使用的回调或清理函数。
   */
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 通知所有候选订阅者，并隔离单个监听器抛出的异常。
   */
  private emit() {
    for (const l of this.listeners) {
      try {
        l(this.current);
      } catch (error) {
        console.log(error);
      }
    }
  }
}

export default AISuggestionBus;
