/**
 * Durable Object for live maintenance chat fan-out.
 */

export class MaintenanceChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      this.sockets.add(server);
      server.addEventListener('close', () => this.sockets.delete(server));
      server.addEventListener('error', () => this.sockets.delete(server));
      server.send(JSON.stringify({ type: 'connected' }));

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' && url.pathname === '/broadcast') {
      const payload = await request.text();
      for (const socket of this.sockets) {
        try {
          socket.send(payload);
        } catch {
          this.sockets.delete(socket);
        }
      }
      return Response.json({ success: true, delivered: this.sockets.size });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
