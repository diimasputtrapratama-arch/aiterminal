'use client';
import { useState } from 'react';
export default function TokenSearch() { const [ca, setCa] = useState('');
  return <div className="card"><h2>Cari token via Contract Address</h2><div className="row"><input style={{ flex: 1 }} placeholder="Mint address" value={ca} onChange={(e) => setCa(e.target.value.trim())} /><button onClick={() => ca && (location.href = '/token/' + ca)}>Analisis</button></div></div>; }
