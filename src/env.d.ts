import type { KronoAPI } from '../shared/contracts/foundation';
declare global {
  interface Window {
    krono?: KronoAPI;
  }
}
