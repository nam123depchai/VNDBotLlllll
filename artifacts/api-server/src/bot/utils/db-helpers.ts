import { db, discordUsersTable, type DiscordUser } from "@workspace/db";
import { eq } from "drizzle-orm";

export function getXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export async function addXp(discordId: string, amount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
  const user = await getOrCreateUser(discordId, "");
  const newTotalXp = user.totalXp + amount;
  let newLevel = user.level;
  let newXp = user.xp + amount;

  while (newXp >= getXpForLevel(newLevel)) {
    newXp -= getXpForLevel(newLevel);
    newLevel++;
  }

  const leveledUp = newLevel > user.level;

  await db
    .update(discordUsersTable)
    .set({ xp: newXp, totalXp: newTotalXp, level: newLevel, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, discordId));

  return { leveledUp, newLevel };
}

export async function getOrCreateUser(discordId: string, username: string): Promise<DiscordUser> {
  const existing = await db
    .select()
    .from(discordUsersTable)
    .where(eq(discordUsersTable.discordId, discordId))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0]!.username !== username && username) {
      await db
        .update(discordUsersTable)
        .set({ username, updatedAt: new Date() })
        .where(eq(discordUsersTable.discordId, discordId));
    }
    return { ...existing[0]!, username: username || existing[0]!.username };
  }

  const [newUser] = await db
    .insert(discordUsersTable)
    .values({ discordId, username, balance: 0 })
    .returning();

  return newUser!;
}

export async function updateBalance(discordId: string, newBalance: number): Promise<void> {
  await db
    .update(discordUsersTable)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, discordId));
}

export async function updateWorkTime(discordId: string): Promise<void> {
  await db
    .update(discordUsersTable)
    .set({ lastWorkTime: new Date(), updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, discordId));
}

export async function getTopUsers(limit = 10): Promise<DiscordUser[]> {
  return db
    .select()
    .from(discordUsersTable)
    .orderBy(discordUsersTable.balance)
    .limit(limit);
}

export async function getTopByLevel(limit = 10): Promise<DiscordUser[]> {
  return db
    .select()
    .from(discordUsersTable)
    .orderBy(discordUsersTable.level)
    .limit(limit);
}
