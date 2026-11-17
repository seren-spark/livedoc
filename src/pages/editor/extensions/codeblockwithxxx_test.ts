/**
 * @file 代码块扩展实验。保留代码块补全插件的实验实现。
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { Node, mergeAttributes } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import isInCodeContext from '@/utils/isInCode';
import { codeBlock } from '@tiptap/extension-code-block';

// 自定义代码块扩展，支持虚拟建议
const CodeBlockWithSuggestion = CodeBlockLowlight.extend({
  /**
   * 注册底层 ProseMirror 插件以处理事务、事件或视图装饰。
   *
   * @returns 整理后的结果列表。
   */
  addProseMirrorPlugins() {
    // 共享状态
    let suggestionEl = null;
    const fimService = null;
    let suggestionTimeout = null;

    // 清理虚拟建议
    /**
     * 移除代码块的当前补全候选及相关展示。
     */
    const clearSuggestion = () => {
      if (suggestionEl && suggestionEl.parentElement) {
        suggestionEl.parentElement.removeChild(suggestionEl);
        suggestionEl = null;
      }
      if (suggestionTimeout) {
        clearTimeout(suggestionTimeout);
        suggestionTimeout = null;
      }
    };
    // 生成 AI 建议
    /**
     * 生成 AI 建议
     *
     * @param prefix 需要匹配或补入的前缀。
     * @param suffix 需要在当前内容后补入的文本。
     * @returns 整理后的文本或标识。
     */
    const generateSuggestion = async (prefix, suffix) => {
      if (!fimService) {
        initFIMService();
        return;
      }
      console.log();

      try {
        //   const suggestion = await fimService.fillInMiddle(prefix, suffix, {
        //     maxTokens: 100,
        //     temperature: 0.7,
        //     topP: 0.9,
        //   });
        //   console.log('suggestion', suggestion);

        return `
                let timer = null;
                return function (fn, time) {
                if(timer){
                    clearTimeout(timer);
                }
                timer = setTimeout(() => {
                    fn.apply(this, arguments);
                },time)
                }  
            }
            
            // 调用
            const debouncedScrollHandler = debounce(function() {
                console.log('滚动事件触发');
            }, 300);
            
            window.addEventListener('scroll', debouncedScrollHandler);`;
      } catch (error) {
        console.error('生成建议失败:', error);
        return null;
      }
    };

    return [
      ...(this.parent?.() || []), // 继承原有代码块插件
      new Plugin({
        key: new PluginKey('code-block-suggestion'),
        view: (editorView) => {
          // 初始化 FIM 服务
          // 更新虚拟建议位置和内容
          /**
           * 更新代码块当前显示的 AI 补全候选。
           */
          const updateSuggestion = async () => {
            const { state } = editorView;
            const selection = state.selection;
            // 检查 selection 是否存在
            if (!selection) {
              clearSuggestion();
              return;
            }

            const $cursor =
              selection instanceof TextSelection ? selection.$cursor : null;

            // 仅在代码块中且有光标的情况下显示建议
            if (!$cursor) {
              clearSuggestion();
              return;
            }

            // 检查是否在代码块中
            const node = $cursor.parent;
            console.log('node', node.type.name);

            if (node.type.name !== 'codeBlock') {
              clearSuggestion();
              return;
            }

            // 获取光标在 DOM 中的位置
            const cursorPos = getCursorPosition();
            console.log(cursorPos, 'cursorPos');

            if (!cursorPos) {
              clearSuggestion();
              return;
            }

            // 获取代码内容
            const codeContent = node.textContent;
            const cursorOffset = $cursor.parentOffset;
            const prefix = codeContent.substring(0, cursorOffset);
            const suffix = codeContent.substring(cursorOffset);

            // // 检查是否有足够的上下文
            // if (prefix.length < 10 || suffix.length < 10) {
            //   clearSuggestion();
            //   return;
            // }

            // 检查是否在代码上下文中
            const context = {
              content: codeContent,
              cursorPosition: cursorOffset,
            };
            if (!isInCodeContext(context)) {
              clearSuggestion();
              return;
            }

            // 延迟生成建议（避免频繁调用）
            if (suggestionTimeout) {
              clearTimeout(suggestionTimeout);
            }

            suggestionTimeout = setTimeout(async () => {
              console.log('扩展生成建议');

              const suggestionText = await generateSuggestion(prefix, suffix);

              if (!suggestionText) {
                clearSuggestion();
                return;
              }
              console.log(suggestionEl, 'suggersionEl');

              // 创建或更新建议元素
              if (!suggestionEl) {
                suggestionEl = createSuggestionEl(suggestionText);
                console.log(555555555555555, editorView.dom);

                editorView.dom.appendChild(suggestionEl);
              } else {
                suggestionEl.textContent = suggestionText;
              }

              // 定位：光标右侧
              suggestionEl.style.left = `${cursorPos.right}px`;
              suggestionEl.style.top = `${cursorPos.top}px`;
            }, 1000); // 1秒延迟
          };
          // 创建虚拟建议元素
          /**
           * 创建虚拟建议元素
           *
           * @param text 待处理的文本。
           * @returns 供页面渲染的组件内容。
           */
          const createSuggestionEl = (text: string) => {
            console.log(text, 'text');

            const el = document.createElement('pre');
            el.className = 'virtual-suggestion';
            el.textContent = text;
            el.style.position = 'absolute';
            el.style.whiteSpace = 'pre-wrap';
            el.style.pointerEvents = 'none';
            el.style.color = '#888';
            el.style.fontFamily = 'Monaco, Menlo, "Ubuntu Mono", monospace';
            el.style.fontSize = '14px';
            el.style.opacity = '0.7';
            el.style.zIndex = '1000';
            return el;
          };

          // 获取光标在 DOM 中的位置
          /**
           * 获取光标在 DOM 中的位置
           *
           * @returns 整理后的状态与操作结果对象。
           */
          const getCursorPosition = () => {
            const { state } = editorView;
            const selection = state.selection;
            // 检查 selection 是否存在
            if (!selection) return null;

            const { $cursor } = selection;

            if (!$cursor) return null;

            try {
              const coords = editorView.coordsAtPos($cursor.pos);
              return coords;
            } catch (error) {
              return null;
            }
          };

          // 监听编辑器更新事件
          return {
            update: (view, prevState) => {
              if (view.state !== prevState) {
                updateSuggestion();
              }
            },
            destroy: clearSuggestion,
          };
        },
      }),
      // 添加快捷键监听
      new Plugin({
        key: new PluginKey('suggestion-handler'),
        props: {
          handleKeyDown: (view, event) => {
            console.log('handleKeyDown');

            // 监听 Tab 键接受建议
            if (event.key === 'Tab' && suggestionEl) {
              const { state, dispatch } = view;
              const { selection } = state;

              // 检查 selection 是否存在
              if (!selection) return false;

              const { $cursor } = selection;
              if (!$cursor) return false;

              // 获取建议文本并插入
              const suggestionText = suggestionEl.textContent || '';
              const transaction = state.tr.insertText(
                suggestionText,
                $cursor.pos,
              );
              dispatch(transaction);

              // 清除建议
              clearSuggestion();
              return true; // 阻止默认 Tab 行为
            }

            // 监听 Esc 键取消建议
            if (event.key === 'Escape' && suggestionEl) {
              clearSuggestion();
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

export default CodeBlockWithSuggestion;
