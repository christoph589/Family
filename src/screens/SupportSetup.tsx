import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { supportStatus } from '../data/cloud';
import { C } from '../ui/theme';
import { SupportAccess } from './Operator';

/** Einstellungen › Familie: Support-Zugang mit Status vom Server. */
export function SupportSetup({ familyId }: { familyId: string }) {
  const [status, setStatus] = useState<{ until: string | null; visits: string[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { supportStatus(familyId).then(setStatus, e => setErr(e.message)); }, [familyId]);
  if (err) return <Text style={{ color: C.muted, fontSize: 13 }}>Support-Zugang: {err}</Text>;
  return <SupportAccess familyId={familyId} status={status} />;
}
