import { type DiscordUser } from "@workspace/db";

interface DagaGame {
  type: "daga";
  challengerId: string;
  opponentId: string;
  betAmount: number;
  challengerData: DiscordUser;
  opponentData: DiscordUser;
  messageId: string;
  channelId: string;
  createdAt: number;
}

interface BlackjackGame {
  type: "blackjack";
  playerId: string;
  betAmount: number;
  playerData: DiscordUser;
  deck: { suit: string; rank: string; value: number }[];
  playerHand: { suit: string; rank: string; value: number }[];
  dealerHand: { suit: string; rank: string; value: number }[];
  hitsCount: number;
  maxHits: number;
  messageId: string;
  channelId: string;
  createdAt: number;
}

export const activeGames = new Map<string, DagaGame | BlackjackGame>();

export function cleanupOldGames(): void {
  const now = Date.now();
  const MAX_AGE = 5 * 60 * 1000; // 5 phút
  for (const [key, game] of activeGames.entries()) {
    if (now - game.createdAt > MAX_AGE) {
      activeGames.delete(key);
    }
  }
}
