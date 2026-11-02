import type { z } from 'zod';
import type { preferencesSchema } from '../contracts/desktop';

// A decisão persistida identifica esta novidade, sem repetir avisos por versão/reinstalação.
export function needsGardenInvitation(preferences: z.infer<typeof preferencesSchema>) {
  const established = preferences.introduction
    ? preferences.introduction.completed
    : preferences.profile?.onboarded || preferences.firstHideSeen;
  return Boolean(
    established &&
    preferences.garden?.enabled === undefined &&
    !preferences.garden?.introductionSeen,
  );
}
