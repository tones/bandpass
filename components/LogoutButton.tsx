'use client';

import { logout } from '@/app/logout/actions';

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded px-3 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        Log out
      </button>
    </form>
  );
}
