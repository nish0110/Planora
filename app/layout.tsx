import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/sidebar';
export const metadata: Metadata = { title: 'Planora — Event coordination', description: 'Plan events, coordinate resources, and prevent booking conflicts.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="shell"><Sidebar/><main className="main">{children}</main></div></body></html>;
}
