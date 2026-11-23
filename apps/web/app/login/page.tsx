'use client';
import { useState } from 'react'; import { api } from '@/lib/client';
export default function Login() {
  const [reg, setReg] = useState(false); const [email, setE] = useState(''); const [pw, setP] = useState(''); const [err, setErr] = useState('');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function go() { try { await api(reg ? '/api/auth/register' : '/api/auth/login', { body: { email, password: pw, timezone: tz } }); location.href = '/'; } catch (e: any) { setErr(e.message); } }
  return <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}><h1>AI Trading Terminal</h1>
    <div className="row"><input placeholder="Email" value={email} onChange={(e) => setE(e.target.value)} style={{ flex: 1 }} /></div>
    <div className="row" style={{ marginTop: 8 }}><input type="password" placeholder="Password (min 10)" value={pw} onChange={(e) => setP(e.target.value)} style={{ flex: 1 }} /></div>
    <div className="row" style={{ marginTop: 8 }}><button onClick={go}>{reg ? 'Daftar' : 'Masuk'}</button><button className="sec" onClick={() => setReg(!reg)}>{reg ? 'Sudah punya akun' : 'Buat akun'}</button></div>
    {err && <p className="err">{err}</p>}<p className="m">Zona waktu: {tz}</p></div>;
}
