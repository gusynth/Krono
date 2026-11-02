import { it, expect } from 'vitest';
import { foundationSchema } from '../../shared/contracts/foundation';
import { appVersion } from '../../shared/version';
it('mantém a versão do manifesto e recusa informações fora do contrato', () => {
  const value = {
    version: appVersion,
    runtime: { electron: '44', node: '24', chrome: '152', abi: '150' },
    storage: 'ready',
  };
  expect(foundationSchema.safeParse(value).success).toBe(true);
  expect(foundationSchema.safeParse({ ...value, version: '0.2.0' }).success).toBe(false);
  expect(foundationSchema.safeParse({ ...value, path: 'private' }).success).toBe(false);
});
