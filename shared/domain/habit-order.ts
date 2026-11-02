/** Presentation order only: never changes identities, occurrences or timer links. */
export function orderedHabits<T extends { id: string }>(
  habits: readonly T[],
  order: readonly string[] = [],
): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...habits].sort(
    (a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length),
  );
}

/** Swap visible neighbours, keeping filtered/archived items in their own slots. */
export function moveHabit(
  all: readonly string[],
  visible: readonly string[],
  id: string,
  direction: -1 | 1,
): string[] | null {
  const index = visible.indexOf(id),
    neighbour = visible[index + direction];
  if (index < 0 || !neighbour) return null;
  const from = all.indexOf(id),
    to = all.indexOf(neighbour);
  if (from < 0 || to < 0) return null;
  const next = [...all];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
