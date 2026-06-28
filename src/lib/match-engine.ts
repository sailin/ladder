import { v4 as uuid } from "uuid";

/**
 * Round Robin match schedule generator.
 *
 * Given a list of player IDs, generates all pairwise matchups.
 * Uses the circle method for fair round distribution.
 *
 * For Doubles: pass pair IDs instead of individual player IDs.
 * Each "player" in the input is actually a pair.
 */
export interface ScheduledMatch {
  round: number;
  player1Id: string;
  player2Id: string;
}

/**
 * Circle method for Round Robin scheduling.
 * If odd number of players, a "bye" is inserted (null player).
 */
export function generateRoundRobin(players: string[]): ScheduledMatch[] {
  const matches: ScheduledMatch[] = [];
  let participants = [...players];

  // If odd, add a dummy "bye"
  const hasBye = participants.length % 2 !== 0;
  if (hasBye) {
    participants.push("__BYE__");
  }

  const numPlayers = participants.length;
  const numRounds = numPlayers - 1;
  const halfSize = numPlayers / 2;

  for (let round = 1; round <= numRounds; round++) {
    for (let i = 0; i < halfSize; i++) {
      const p1 = participants[i];
      const p2 = participants[numPlayers - 1 - i];

      // Skip bye matches
      if (p1 !== "__BYE__" && p2 !== "__BYE__") {
        matches.push({
          round,
          player1Id: p1,
          player2Id: p2,
        });
      }
    }

    // Rotate: keep first element fixed, rotate the rest clockwise
    const first = participants[0];
    const rotated = participants.slice(1);
    const last = rotated.pop()!;
    rotated.unshift(last);
    participants = [first, ...rotated];
  }

  return matches;
}

/**
 * Generate matches for Team format.
 * Coach defines matchups manually, but this provides a simple
 * structure for initial seeding.
 */
export function generateTeamMatches(
  teamAPlayers: string[],
  teamBPlayers: string[],
  rounds: number
): ScheduledMatch[] {
  const matches: ScheduledMatch[] = [];

  for (let round = 1; round <= rounds; round++) {
    const maxMatches = Math.min(teamAPlayers.length, teamBPlayers.length);
    for (let i = 0; i < maxMatches; i++) {
      matches.push({
        round,
        player1Id: teamAPlayers[i],
        player2Id: teamBPlayers[i],
      });
    }
  }

  return matches;
}

/**
 * For Doubles: generate pairs from a list of registered player IDs.
 * Players who signed up with a partner are kept together.
 * Remaining players are paired randomly or left for manual assignment.
 */
export interface Pair {
  id: string;
  playerIds: [string, string];
}

export function generatePairs(
  registrations: { userId: string; partnerId: string | null }[],
  unpairedPlayers: string[]
): Pair[] {
  const pairs: Pair[] = [];
  const used = new Set<string>();

  // First, pair up those who signed up together
  for (const reg of registrations) {
    if (used.has(reg.userId)) continue;

    if (reg.partnerId && !used.has(reg.partnerId)) {
      pairs.push({
        id: uuid(),
        playerIds: [reg.userId, reg.partnerId],
      });
      used.add(reg.userId);
      used.add(reg.partnerId);
    }
  }

  // Then pair remaining unpaired players randomly
  const remaining = unpairedPlayers.filter((p) => !used.has(p));

  // Fisher-Yates shuffle
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  for (let i = 0; i < remaining.length - 1; i += 2) {
    pairs.push({
      id: uuid(),
      playerIds: [remaining[i], remaining[i + 1]],
    });
  }

  // If odd player left, they get paired with the last available
  if (remaining.length % 2 !== 0) {
    const lastPlayer = remaining[remaining.length - 1];
    pairs.push({
      id: uuid(),
      playerIds: [lastPlayer, lastPlayer], // Self-pair (needs manual adjustment)
    });
  }

  return pairs;
}
