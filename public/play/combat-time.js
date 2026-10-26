// GURPS default. Historical encounter metadata remains readable without rescaling saved time.
export const DEFAULT_COMBAT_ROUND_SECONDS = 1;
export function combatRoundSeconds(combat) {
  return combat?.roundSeconds === 6 ? 6 : 1;
}
