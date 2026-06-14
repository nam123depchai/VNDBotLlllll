import { db, questsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export async function incrementQuestProgress(discordId: string, questType: string, amount: number = 1): Promise<void> {
  const quests = await db
    .select()
    .from(questsTable)
    .where(
      and(
        eq(questsTable.discordId, discordId),
        eq(questsTable.questType, questType),
        eq(questsTable.completed, false)
      )
    );

  for (const quest of quests) {
    const newProgress = quest.progress + amount;
    const isCompleted = newProgress >= quest.target;
    await db
      .update(questsTable)
      .set({
        progress: newProgress,
        completed: isCompleted,
        updatedAt: new Date(),
      })
      .where(eq(questsTable.id, quest.id));
  }
}

export async function incrementEarnQuest(discordId: string, amountEarned: number): Promise<void> {
  const quests = await db
    .select()
    .from(questsTable)
    .where(
      and(
        eq(questsTable.discordId, discordId),
        eq(questsTable.questType, "earn"),
        eq(questsTable.completed, false)
      )
    );

  for (const quest of quests) {
    const newProgress = quest.progress + amountEarned;
    const isCompleted = newProgress >= quest.target;
    await db
      .update(questsTable)
      .set({
        progress: newProgress,
        completed: isCompleted,
        updatedAt: new Date(),
      })
      .where(eq(questsTable.id, quest.id));
  }
}
