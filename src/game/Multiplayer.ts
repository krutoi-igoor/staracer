import * as THREE from 'three';
import { Track } from './Track';
import { MULTIPLAYER_URL, AI_COLORS } from './constants';

interface RemoteState { t: number; lat: number; lap: number; }

function makeRemoteMesh(): THREE.Group {
  const g   = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 0.6, flatShading: true });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 3.2), mat));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.0, 4), mat);
  nose.geometry.rotateX(Math.PI / 2);
  nose.position.z = 2.6;
  g.add(nose);
  return g;
}

export class Multiplayer {
  private ws: WebSocket | null = null;
  private remotes = new Map<string, { state: RemoteState; mesh: THREE.Group }>();
  readonly clientId = Math.random().toString(36).slice(2, 9);
  private _connected = false;
  private _reconnectTimer = 0;

  constructor(private scene: THREE.Scene) {
    if (MULTIPLAYER_URL) this._connect();
  }

  get connected() { return this._connected; }

  private _connect() {
    try {
      this.ws = new WebSocket(MULTIPLAYER_URL);
      this.ws.onopen    = () => { this._connected = true; };
      this.ws.onmessage = e => this._onMsg(e);
      this.ws.onclose   = () => {
        this._connected = false;
        // retry after 3 s
        this._reconnectTimer = window.setTimeout(() => this._connect(), 3000);
      };
      this.ws.onerror = () => {};
    } catch {}
  }

  private _onMsg(e: MessageEvent) {
    try {
      const msg = JSON.parse(e.data as string);
      if (msg.type !== 'state') return;

      const players: Record<string, RemoteState> = msg.players;

      // Add/update
      for (const [id, st] of Object.entries(players)) {
        if (id === this.clientId) continue;
        if (!this.remotes.has(id)) {
          const mesh = makeRemoteMesh();
          this.scene.add(mesh);
          this.remotes.set(id, { state: st, mesh });
        } else {
          this.remotes.get(id)!.state = st;
        }
      }

      // Remove disconnected
      for (const [id, r] of this.remotes) {
        if (!players[id]) {
          r.mesh.removeFromParent();
          this.remotes.delete(id);
        }
      }
    } catch {}
  }

  send(t: number, lat: number, lap: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'update', id: this.clientId, t, lat, lap }));
    }
  }

  update(track: Track) {
    for (const r of this.remotes.values()) {
      const { pos, tangent, up } = track.getTransform(r.state.t, r.state.lat);
      r.mesh.position.copy(pos);
      r.mesh.up.copy(up);
      r.mesh.lookAt(pos.clone().add(tangent));
    }
  }

  destroy() {
    clearTimeout(this._reconnectTimer);
    this.ws?.close();
    for (const r of this.remotes.values()) r.mesh.removeFromParent();
  }

  get remoteCount() { return this.remotes.size; }
}
