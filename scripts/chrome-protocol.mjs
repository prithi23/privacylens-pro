/** Small native CDP client; keeps browser automation independent of UI/Chrome API mocks. */
export async function connectProtocol(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const result = JSON.parse(event.data);
    const task = pending.get(result.id);
    if (task) {
      pending.delete(result.id);
      clearTimeout(task.timer);
      if (result.error) task.reject(new Error(result.error.message));
      else task.resolve(result.result);
    }
  });
  socket.addEventListener('close', () => {
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(new Error('Chrome protocol connection closed'));
    }
    pending.clear();
  });
  return {
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome protocol timeout: ${method}`));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}
