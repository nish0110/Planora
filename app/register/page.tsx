'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Sparkles } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: form.get('fullName'), email: form.get('email'), password: form.get('password') }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not complete initial setup.');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete initial setup.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="auth-shell"><section className="auth-card">
    <Link href="/login" className="brand auth-brand"><span className="brand-mark"><Sparkles size={19}/></span><span>planora<small>EVENT STUDIO</small></span></Link>
    <div className="eyebrow">FIRST-TIME SETUP</div><h1>Create administrator</h1><p className="subheading">This one-time setup creates the first workspace administrator.</p>
    <form className="auth-form" onSubmit={submit}>
      <label>Full name<input name="fullName" required minLength={2} maxLength={120} autoComplete="name"/></label>
      <label>Email<input type="email" name="email" required maxLength={255} autoComplete="email"/></label>
      <label>Password<input type="password" name="password" required minLength={10} autoComplete="new-password"/><small>At least 10 characters, including uppercase, lowercase, and a number.</small></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" type="submit" disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>} Set up workspace</button>
    </form>
    <p className="auth-foot">Already set up? <Link href="/login">Sign in</Link></p>
  </section></div>;
}
