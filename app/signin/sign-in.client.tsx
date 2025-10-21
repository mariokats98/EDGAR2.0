'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { signIn, type SignInResponse } from 'next-auth/react';

export default function SignInClient() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // NextAuth v4: no generic on signIn, cast the response shape
      const res = (await signIn('credentials', {
        redirect: false,
        email,
        password,
      })) as SignInResponse | undefined;

      if (res?.error) {
        setError(res.error);
      } else if (res?.ok) {
        router.push('/account');
      } else if (res?.url) {
        window.location.href = res.url;
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Sign-in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          required
          autoComplete="current-password"
        />
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="liquid-btn inline-flex w-full items-center justify-center rounded-full px-4 py-2 font-medium"
      >
        <span>{loading ? 'Signing in…' : 'Sign in'}</span>
      </button>
    </form>
  );
}