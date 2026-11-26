import { useEffect, useState } from 'react';
import { Image, ImageProps, View } from 'react-native';
import { cloudEnabled, currentFamilyId, sb } from '../data/cloud';

/**
 * Große Bilder liegen nicht im Familienstand, sondern in der Tabelle family_photos.
 * Im Stand steht dann nur "ph:<id>". Hier werden sie bei Bedarf geladen und gemerkt.
 */
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export const isRef = (v?: string) => !!v && v.startsWith('ph:');

export function loadPhoto(ref: string): Promise<string> {
  if (!isRef(ref)) return Promise.resolve(ref);
  const hit = cache.get(ref);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(ref);
  if (!p) {
    p = (async () => {
      if (!cloudEnabled) return '';
      const fid = await currentFamilyId();
      if (!fid) return '';
      const { data } = await sb().from('family_photos').select('data').eq('family_id', fid).eq('id', ref.slice(3)).maybeSingle();
      const v = (data as { data?: string } | null)?.data ?? '';
      if (v) cache.set(ref, v);
      return v;
    })().finally(() => pending.delete(ref));
    pending.set(ref, p);
  }
  return p;
}

/** Löst eine Liste auf (für KI-Aufrufe). Nicht ladbare Bilder fallen weg. */
export async function loadPhotos(list: string[]): Promise<string[]> {
  return (await Promise.all(list.map(loadPhoto))).filter(Boolean);
}

export function usePhoto(src?: string): string | undefined {
  const [v, setV] = useState(() => (src && isRef(src) ? cache.get(src) : src));
  useEffect(() => {
    if (!src || !isRef(src)) { setV(src); return; }
    let on = true;
    setV(cache.get(src));
    loadPhoto(src).then(x => on && setV(x || undefined));
    return () => { on = false; };
  }, [src]);
  return v;
}

/** Wie <Image>, nimmt aber auch "ph:"-Verweise. */
export function PhotoImg({ uri, ...rest }: Omit<ImageProps, 'source'> & { uri?: string }) {
  const v = usePhoto(uri);
  if (!v) return <View style={[rest.style as any, { backgroundColor: '#e4e6f0' }]} />;
  return <Image {...rest} source={{ uri: v }} />;
}
