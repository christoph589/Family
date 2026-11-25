import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { C } from './theme';

/** Kleines Fenster über dem Inhalt. Tippen daneben schließt es. Der Kalender darunter bleibt stehen. */
export function Popup({ onClose, children, accent }: { onClose: () => void; children: ReactNode; accent?: string }) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Schließen" style={{ flex: 1, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: C.surface, borderRadius: 20, overflow: 'hidden', borderLeftWidth: accent ? 8 : 0, borderLeftColor: accent }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
