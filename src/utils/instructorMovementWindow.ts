/** First point at which a staff card may disclose schedule movement. */
export function firstInstructorEditAt(requests: ReadonlyArray<{ submittedAt?: string | null }>): number | null {
  const submitted = requests
    .map(request => Date.parse(String(request.submittedAt || "")))
    .filter(Number.isFinite);
  return submitted.length ? Math.min(...submitted) : null;
}

/** Keep schedule and request history hidden until the instructor has sent a request. */
export function movementAfterInstructorEdit<T extends { at: string }>(
  entries: ReadonlyArray<T>,
  requests: ReadonlyArray<{ submittedAt?: string | null }>,
): T[] {
  const startAt = firstInstructorEditAt(requests);
  if (startAt === null) return [];
  return entries.filter(entry => {
    const at = Date.parse(String(entry.at || ""));
    return Number.isFinite(at) && at >= startAt;
  });
}
