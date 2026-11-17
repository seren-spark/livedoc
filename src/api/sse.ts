/**
 * @file SSE 消息解析。将网络分片还原为完整事件，处理跨分片消息与流结束。
 */
/**
 * 把网络分片还原为完整 SSE 消息，再由调用方校验业务事件。
 *
 *  Read complete SSE events while leaving protocol validation to each caller.
 *
 * @param body 请求正文或待提交的数据。
 * @param onEvent 接收到完整事件时调用的处理函数。
 * @param eventField 从事件中提取的字段名。
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string | undefined, data: string) => void | Promise<void>,
  eventField: 'first' | 'last' = 'first',
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  /**
   * 解析一条完整 SSE 消息的事件名和多行数据，再交给订阅者。
   *
   * @param frame 一条完整的 SSE 消息。
   */
  const consume = async (frame: string) => {
    const lines = frame.split('\n');
    const events = lines.filter((line) => line.startsWith('event:'));
    const event = (eventField === 'first' ? events[0] : events.at(-1))
      ?.slice(6)
      .trim();
    const data = lines.filter((line) => line.startsWith('data:'));
    if (data.length) {
      await onEvent(
        event,
        data.map((line) => line.slice(5).trimStart()).join('\n'),
      );
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(
        /\r\n/g,
        '\n',
      );
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        await consume(frame);
      }
      if (done) {
        if (buffer.trim()) await consume(buffer);
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
