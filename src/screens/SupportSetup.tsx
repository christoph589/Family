import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { setSupport, supportStatus } from '../data/cloud';
import { C } from '../ui/theme';
import { SupportAccess } from './Operator';

/** Einstellungen › Familie: Support-Zugang mit Status vom Server. */
export function SupportSetup({ familyId }: { familyId: string }) {
  const [status, setStatus] = useState<{ until: string | null; visits: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { supportStatus(familyId).then(setStatus, e => setErr(e.message)); }, [familyId]);
  if (err) return <Text style={{ color: C.muted, fontSize: 13 }}>Support-Zugang: {err}</Text>;
  return <SupportAccess familyId={familyId} status={status} busy={busy} onChange={h => {
    setBusy(true);
    setSupport(familyId, h).then(until => setStatus(s => ({ visits: s?.visits ?? [], until })), e => setErr(e.message)).finally(() => setBusy(false));
  }} />;
}
