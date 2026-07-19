export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
      <p className="font-medium">Couldn&rsquo;t load data</p>
      <p className="mt-1 text-rose-600">{message}</p>
      <p className="mt-2 text-xs text-rose-500">
        Is the API running? Start it with{' '}
        <code className="rounded bg-white px-1 py-0.5">npm run dev:server</code> (or{' '}
        <code className="rounded bg-white px-1 py-0.5">npm run dev:all</code> for both).
      </p>
    </div>
  );
}
