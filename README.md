# AI Trading Terminal — Solana Meme Coins

Platform modular: **scanner token baru** (Pump.fun, PumpSwap, Raydium via WebSocket RPC) → **analisis on-chain & keamanan** → **12 agent AI** → **Risk Engine (tidak bisa dilewati)** → **eksekusi paper / live (Jupiter)** → **TP/SL otomatis** → **laporan harian/bulanan, kalender, notifikasi Telegram**.

```
apps/web      Dashboard Next.js (Vercel)        — semua API key diisi di menu Pengaturan
apps/worker   Proses 24/7 (Railway/Fly/VPS)     — scanner, pipeline, monitor TP/SL, wallet, jadwal laporan
packages/core Logika murni + klien API          — risk, skor, TP/SL, PnL, laporan, agent (34 test)
packages/server Akses database bersama
prisma/       Skema 22 tabel
```

## Deploy dari HP (tanpa terminal)
1. **Database**: buat akun di neon.tech (gratis) → buat project → salin *connection string* → itu `DATABASE_URL`.
2. **GitHub**: buat repo *Private*, upload isi folder proyek (Add file → Upload files). Folder tersembunyi `.github` ikut jika lewat "Upload files" dari file manager; kalau tidak, tidak masalah (CI opsional).
3. **Web (Vercel)**: vercel.com → Add New Project → pilih repo → **Root Directory = `apps/web`** → Environment Variables: `DATABASE_URL`, `MASTER_KEY`, `SESSION_SECRET` (acak ≥32 karakter; boleh pakai generator password) → Deploy.
4. **Worker (Railway)**: railway.com → New Project → Deploy from GitHub repo (root repo, ia membaca `railway.json`/`Dockerfile.worker`) → Variables: `DATABASE_URL`, `MASTER_KEY` (**sama persis dengan Vercel**), `ALLOW_LIVE=false`. Saat start, ia otomatis membuat tabel (`prisma db push`).
5. Buka situs Vercel → **Buat akun** → menu **Pengaturan** → isi RPC URL + WebSocket (mis. Helius), Telegram, (opsional) Anthropic/Jupiter/X key → Simpan. Worker membaca pengaturan ini otomatis (≤30 detik).
6. Di Pengaturan → **Deposit** modal paper (mis. 1000), pilih mode, centang *auto-trade* bila ingin simulasi otomatis.
7. Setelah akun Anda dibuat, set `ALLOW_REGISTER=false` di Vercel.

## Jaminan desain
- Data tidak tersedia ⇒ **`UNKNOWN`**, tidak ditebak. Keamanan UNKNOWN ⇒ order **ditolak** (fail-closed).
- Token baru **tidak otomatis dibeli**; harus lolos skor, cakupan data, filter, lalu Risk Engine.
- Instruksi pengguna hanya bisa **memperketat** batas; instruksi mematikan SL/validasi/keamanan diabaikan.
- Execution Agent hanya menerima `ApprovedOrder` dari Risk Management (dijaga tipe & test).
- API key pengguna dienkripsi AES-256-GCM, tidak pernah dikirim balik ke browser.
- LIVE butuh 3 hal sekaligus: `ALLOW_LIVE=true` di worker, mode *live* di Pengaturan, dan private key wallet di Pengaturan.
- Tidak ada klaim profit. Hasil paper ≠ hasil live (slippage, MEV, kegagalan tx).

## Batasan yang jujur
- **Belum diuji end-to-end terhadap jaringan Solana nyata** (lingkungan pembuatan tanpa internet). 34 test unit untuk inti logika lulus; worker/web wajib diuji lewat paper trading.
- Jumlah holder & pertumbuhan holder butuh RPC dengan DAS (Helius); tanpa itu = UNKNOWN. Skor sosial butuh X API berbayar; tanpa itu hanya cek keberadaan link sosial.
- Deteksi *bundled buy* hanya proksi slot awal (opsional, boros kredit RPC). Pelacakan funder wallet belum ada.
- Performa smart wallet hanya dari transaksi yang terpantau sejak ditambahkan (bukan riwayat penuh/PnL pasti).
- Alamat program & endpoint Jupiter/DexScreener bisa berubah: verifikasi dengan dokumentasi resmi (`packages/core/src/solana/programs.ts`, URL dasar Jupiter bisa diganti).
- Export PDF memakai fitur cetak browser ("Simpan sebagai PDF").

## Sebelum uang nyata (wajib)
1. Paper trading ≥ 2 minggu; periksa laporan & log agent. 2. Cek kecocokan harga fill paper vs pasar. 3. Uji kill switch. 4. Wallet khusus modal kecil, bukan wallet utama. 5. Naikkan modal bertahap.
