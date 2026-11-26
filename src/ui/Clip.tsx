import { useState } from 'react';
import { Text, TextProps } from 'react-native';

/** Text mit Zeilenbegrenzung: Antippen zeigt den vollen Text, nochmal Antippen kürzt wieder.
 *  longPress: für Texte in antippbaren Zeilen (Tipp bleibt beim Elternelement, langes Drücken klappt auf). */
export function Clip({ lines, longPress, onPress, ...rest }: TextProps & { lines: number; longPress?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen(o => !o);
  return (
    <Text
      {...rest}
      numberOfLines={open ? undefined : lines}
      onPress={longPress ? onPress : toggle}
      onLongPress={longPress ? toggle : undefined}
    />
  );
}
