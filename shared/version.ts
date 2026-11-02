import manifest from '../package.json' with { type: 'json' };
import identity from './build.json' with { type: 'json' };
export const appVersion = manifest.version;
export const buildNumber = identity.number;
