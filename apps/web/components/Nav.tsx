'use client';
import Link from 'next/link'; import { usePathname } from 'next/navigation';
const L = [['/', 'Dashboard'], ['/token', 'Token'], ['/command-center', 'AI Command'], ['/wallets', 'Wallet'], ['/calendar', 'Kalender'], ['/reports', 'Laporan'], ['/settings', 'Pengaturan']];
export default function Nav() { const p = usePathname(); if (p === '/login') return null;
  return <nav>{L.map(([h, t]) => <Link key={h} href={h} className={(h === '/' ? p === '/' : p.startsWith(h)) ? 'on' : ''}>{t}</Link>)}</nav>; }
