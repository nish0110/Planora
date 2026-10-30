'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarDays, LayoutDashboard, Boxes, Wallet, Settings, Sparkles, CircleHelp, LogOut, BriefcaseBusiness, ClipboardList } from 'lucide-react';

type CurrentUser = { full_name: string; role_name: string };
const links = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/resources', label: 'Resources', icon: Boxes },
  { href: '/bookings', label: 'Bookings', icon: ClipboardList },
  { href: '/services', label: 'Vendor services', icon: BriefcaseBusiness },
  { href: '/budget', label: 'Budget & reports', icon: Wallet },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (path === '/login' || path === '/register') return;
    let active = true;
    fetch('/api/auth/me').then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      if (active) setUser(body.data);
    }).catch((error) => console.error('Could not load sidebar user', error));
    return () => { active = false; };
  }, [path]);

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Could not sign out.');
      router.replace('/login');
      router.refresh();
    } catch (error) {
      console.error(error);
      setSigningOut(false);
    }
  }

  return <aside className="sidebar">
    <Link href="/" className="brand"><span className="brand-mark"><Sparkles size={19}/></span><span>planora<small>EVENT STUDIO</small></span></Link>
    <div className="workspace"><div className="workspace-icon">PS</div><div><strong>Planora Studio</strong><small>Workspace</small></div><span className="chevron">⌄</span></div>
    <div className="nav-label">WORKSPACE</div>
    <nav>{links.map((link) => { const Icon = link.icon; return <Link key={link.href} href={link.href} className={`nav-link ${path === link.href || path.startsWith(`${link.href}/`) && link.href !== '/' ? 'active' : ''}`}><Icon size={18}/>{link.label}</Link>; })}
      {user?.role_name === 'ADMIN' && <Link href="/team" className={`nav-link ${path.startsWith('/team') ? 'active' : ''}`}><Settings size={18}/>Team & access</Link>}
    </nav>
    <div className="sidebar-bottom">
      <Link href="/resources" className="help-card"><span className="help-icon"><CircleHelp size={17}/></span><span><strong>Need a hand?</strong><small>Explore resource planning</small></span></Link>
      <div className="profile"><div className="avatar">{user?.full_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'PL'}</div><div className="profile-copy"><strong>{user?.full_name || 'Loading account'}</strong><small>{user?.role_name || 'Workspace member'}</small></div><button className="icon-button logout-button" type="button" onClick={signOut} disabled={signingOut} aria-label="Sign out" title="Sign out"><LogOut size={16}/></button></div>
    </div>
  </aside>;
}
