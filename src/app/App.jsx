import React, { useState, useEffect } from 'react';
import { supabase } from './supa';

export default function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>CEDET Produção</h1>
      <p>App inicializado corretamente.</p>
    </div>
  );
}
