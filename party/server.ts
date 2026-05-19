import type * as Party from 'partykit/server';

interface PlayerState { t: number; lat: number; lap: number; }
interface StateMap { [clientId: string]: PlayerState; }

export default class RaceServer implements Party.Server {
  private players: StateMap = {};
  private connToId = new Map<string, string>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // Send current state to the newly joined player
    conn.send(JSON.stringify({ type: 'state', players: this.players }));
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const msg = JSON.parse(message);
      if (msg.type === 'update') {
        const { id, t, lat, lap } = msg as { id: string; t: number; lat: number; lap: number };
        this.players[id] = { t, lat, lap };
        // Map connection → client id so we can clean up on disconnect
        this.connToId.set(sender.id, id);
        // Broadcast to everyone (including sender so all clients stay in sync)
        this.room.broadcast(JSON.stringify({ type: 'state', players: this.players }));
      }
    } catch {}
  }

  onClose(conn: Party.Connection) {
    const clientId = this.connToId.get(conn.id);
    if (clientId) {
      delete this.players[clientId];
      this.connToId.delete(conn.id);
      this.room.broadcast(JSON.stringify({ type: 'state', players: this.players }));
    }
  }
}
