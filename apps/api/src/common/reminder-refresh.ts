export const REMINDER_REFRESH = Symbol("REMINDER_REFRESH");

/**
 * Lets the me module ask the messaging engine to re-plan a contractor's reminders (cancelling obsolete follow-ups)
 * after they confirm or change their situation, without importing the engine itself.
 */
export interface ReminderRefresher {
  refresh(contractorId: string, now: Date): Promise<void>;
}
