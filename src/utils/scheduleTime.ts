/**
 * The single teaching-day contract shared by browser and server.
 * A view, suggestion and saved appointment must never disagree about it.
 */
export const SCHEDULE_DAY_START = 8 * 60;
export const SCHEDULE_DAY_END = 20 * 60;
export const SCHEDULE_DAY_SPAN = SCHEDULE_DAY_END - SCHEDULE_DAY_START;
export const SCHEDULE_SLOT_MINUTES = 30;

export const SCHEDULE_DAY_START_TIME = "08:00";
export const SCHEDULE_DAY_END_TIME = "20:00";

export function withinScheduleDay(start: number, end: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) &&
    start >= SCHEDULE_DAY_START && end <= SCHEDULE_DAY_END && end > start;
}

