// Spaced repetition scheduler (a simplified version of the SM-2 / Anki algorithm).
// Pure functions only — no database code — so it is easy to test or swap out.
//
// Grades:  0 = Again (forgot)   1 = Hard   2 = Good   3 = Easy

export const GRADES = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };

const MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;
const AGAIN_DELAY_MS = 60 * 1000; // a forgotten card comes back in 1 minute

export function newProgress() {
  return { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
}

/**
 * Given a card's current progress and a grade, return its new progress.
 * @param {{ease:number, interval_days:number, reps:number, lapses:number}} p
 * @param {0|1|2|3} grade
 * @param {Date} now
 */
export function schedule(p, grade, now = new Date()) {
  let { ease, interval_days: interval, reps, lapses } = p;

  if (grade === GRADES.AGAIN) {
    return {
      ease: Math.max(MIN_EASE, ease - 0.2),
      interval_days: 0,
      reps: 0,
      lapses: lapses + 1,
      due_at: new Date(now.getTime() + AGAIN_DELAY_MS).toISOString(),
    };
  }

  if (grade === GRADES.HARD) {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = reps === 0 ? 0.5 : Math.max(1, interval * 1.2);
  } else if (grade === GRADES.GOOD) {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : interval * ease;
  } else if (grade === GRADES.EASY) {
    ease = ease + 0.15;
    interval = reps === 0 ? 4 : reps === 1 ? 6 : interval * ease * 1.3;
  } else {
    throw new Error(`Invalid grade: ${grade}`);
  }

  interval = Math.round(interval * 10) / 10;
  return {
    ease: Math.round(ease * 100) / 100,
    interval_days: interval,
    reps: reps + 1,
    lapses,
    due_at: new Date(now.getTime() + interval * DAY_MS).toISOString(),
  };
}

/** Human-friendly label for the next interval each grade would produce. */
export function previewIntervals(p, now = new Date()) {
  return [0, 1, 2, 3].map((g) => {
    const next = schedule(p, g, now);
    const ms = new Date(next.due_at) - now;
    return formatDuration(ms);
  });
}

function formatDuration(ms) {
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))}m`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
