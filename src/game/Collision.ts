import { Car } from './Car';
import { CAR_RADIUS } from './constants';

/**
 * Resolve pairwise collisions between all cars.
 * Called once per physics frame after all cars have updated their positions.
 */
export function resolveCollisions(cars: Car[]) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];

      if (a.finished && b.finished) continue;

      const dx   = a.mesh.position.x - b.mesh.position.x;
      const dy   = a.mesh.position.y - b.mesh.position.y;
      const dz   = a.mesh.position.z - b.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < CAR_RADIUS * 2 && dist > 0.001) {
        const overlap = CAR_RADIUS * 2 - dist;

        // Resolve laterally: push based on which car is more to the right
        const latA = a.lateral >= b.lateral ? 1 : -1;
        const latB = -latA;

        const push = overlap * 0.6;
        a.applyLateralImpulse(latA * push);
        b.applyLateralImpulse(latB * push);

        // Speed exchange: faster car gives some speed to slower
        const relSpd = (a.speed - b.speed) * 0.25;
        a.speed = Math.max(0, a.speed - relSpd);
        b.speed = Math.max(0, b.speed + relSpd);
      }
    }
  }
}
