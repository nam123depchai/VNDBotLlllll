import { db, discordUsersTable, type DiscordUser } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getOrCreateUser(discordId: string, username: string): Promise<DiscordUser> {
  const existing = await db
    .select()
    .from(discordUsersTable)
    .where(eq(discordUsersTable.discordId, discordId))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0]!.username !== username) {
      await db
        .update(discordUsersTable)
        .set({ username, updatedAt: new Date() })
        .where(eq(discordUsersTable.discordId, discordId));
    }
    return { ...existing[0]!, username };
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
