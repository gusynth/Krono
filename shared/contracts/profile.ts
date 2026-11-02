import { z } from 'zod';

export const avatarIds = [
  'brasa',
  'musgo',
  'nimbo',
  'amora',
  'lumi',
  'mare',
  'gato',
  'cachorro',
  'tigre',
  'raposa',
  'coruja',
  'coelho',
] as const;
export const profileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(40)
      .refine(
        (value) =>
          !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
        'Nome inválido',
      ),
    avatar: z.enum(avatarIds).nullable(),
    onboarded: z.boolean(),
  })
  .strict();
export type LocalProfile = z.infer<typeof profileSchema>;
export const defaultProfile = (): LocalProfile => ({ name: '', avatar: null, onboarded: false });
