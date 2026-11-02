import { expect, it } from 'vitest';
import {
  defaultPreferences,
  preferencesSchema,
  preferenceUpdateSchema,
} from '../../shared/contracts/desktop';
import { profileSchema } from '../../shared/contracts/profile';
import { shellReplySchema } from '../../shared/contracts/shell-dialog';
import { timezoneLabel } from '../../src/design/timezoneLabel';

it('perfil é aditivo; preferências legadas continuam válidas e nenhum caminho externo é aceito', () => {
  expect(preferencesSchema.parse(defaultPreferences()).profile).toBeUndefined();
  const profile = { name: '  Ana  ', avatar: 'mare', onboarded: true };
  expect(
    preferenceUpdateSchema.parse({ expectedRevision: 0, patch: { profile } }).patch.profile?.name,
  ).toBe('Ana');
  for (const invalid of [
    { ...profile, avatar: '../../file' },
    { ...profile, name: 'a'.repeat(41) },
    { ...profile, name: 'Ana\nSilva' },
    { ...profile, url: 'https://example.test' },
  ])
    expect(profileSchema.safeParse(invalid).success).toBe(false);
  expect(profileSchema.parse({ name: '', avatar: null, onboarded: true }).avatar).toBeNull();
  expect(shellReplySchema.safeParse({ id: crypto.randomUUID(), choice: 'execute' }).success).toBe(
    false,
  );
  expect(timezoneLabel('America/Sao_Paulo')).toBe('São Paulo');
  expect(timezoneLabel('UTC')).toBe('UTC');
});
