/** Retired and sabbatical instructors remain visible in records, but cannot be assigned to new work. */
export function isAssignableInstructor(person: { AdInstructorStatus?: string | null } | null | undefined): boolean {
  return Boolean(person) && !person?.AdInstructorStatus;
}
