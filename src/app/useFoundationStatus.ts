import { useEffect, useState } from 'react';
import { foundationSchema } from '../../shared/contracts/foundation';

export type StorageStatus = 'web' | 'checking' | 'ready' | 'error';

export function useFoundationStatus(): StorageStatus {
  const [status, setStatus] = useState<StorageStatus>(window.krono ? 'checking' : 'web');
  useEffect(() => {
    let active = true;
    const api = window.krono;
    if (api)
      void api
        .foundation()
        .then((value) => {
          const result = foundationSchema.parse(value);
          if (active) setStatus(result.storage);
        })
        .catch(() => {
          if (active) setStatus('error');
        });
    return () => {
      active = false;
    };
  }, []);
  return status;
}
