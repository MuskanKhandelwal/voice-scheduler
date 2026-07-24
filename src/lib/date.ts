/** Local-timezone YYYY-MM-DD, unlike `Date#toISOString` which is UTC. */
export function localISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
