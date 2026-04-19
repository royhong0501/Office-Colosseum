import { useState } from 'react';
import { ALL_CHARACTERS } from '@office-colosseum/shared';

export default function App() {
  const [screen] = useState('menu');
  return (
    <div style={{ padding: 20, fontFamily: 'Microsoft JhengHei, sans-serif' }}>
      <h1>Office Colosseum</h1>
      <p>Screen: {screen}</p>
      <p>Loaded {ALL_CHARACTERS.length} characters from shared package.</p>
    </div>
  );
}
