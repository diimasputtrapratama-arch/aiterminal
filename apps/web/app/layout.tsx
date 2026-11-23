import './globals.css';
import Nav from '@/components/Nav';
export const metadata = { title: 'AI Trading Terminal', description: 'Solana meme coin AI trading' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><Nav /><main>{children}</main></body></html>);
}
