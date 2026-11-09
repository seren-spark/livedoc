/** Read complete SSE events while leaving protocol validation to each caller. */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string | undefined, data: string) => void | Promise<void>,
  eventField: 'first' | 'last' = 'first',
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
