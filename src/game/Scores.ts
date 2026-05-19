export interface ScoreEntry {
  difficulty: string;
  trackId:    string;
  carId:      string;
  raceTime:   number;
  bestLap:    number;
  date:       number;
}

const KEY = 'staracer_scores_v1';

export const Scores = {
  getAll(): ScoreEntry[] {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
  },

  save(entry: ScoreEntry) {
    const all = this.getAll();
    all.push(entry);
    // Keep top 50 total, sort by raceTime ascending
    all.sort((a, b) => a.raceTime - b.raceTime);
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
  },

  getBest(difficulty: string, trackId: string): ScoreEntry[] {
    return this.getAll()
      .filter(s => s.difficulty === difficulty && s.trackId === trackId)
      .sort((a, b) => a.raceTime - b.raceTime)
      .slice(0, 5);
  },

  isNewBest(entry: ScoreEntry): boolean {
    const best = this.getBest(entry.difficulty, entry.trackId);
    return best.length === 0 || entry.raceTime < best[0].raceTime;
  },

  fmt(s: number): string {
    const m  = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    const t  = Math.floor((s % 1) * 10);
    return `${m}:${String(ss).padStart(2, '0')}.${t}`;
  },
};
