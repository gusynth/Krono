import { CleanStudy } from '../study/CleanStudy';
import { useFoundationStatus } from './useFoundationStatus';

/** Desktop e prévia usam a mesma composição; somente o desktop consulta o diagnóstico IPC. */
export function App() {
  return <CleanStudy storageStatus={useFoundationStatus()} />;
}
