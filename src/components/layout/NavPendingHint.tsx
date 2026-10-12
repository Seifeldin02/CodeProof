"use client";

import { useLinkStatus } from "next/link";

/** Only appears when a route takes long enough to notice; never replaces the current page. */
export default function NavPendingHint({ mobile = false }: { mobile?: boolean }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`${mobile ? "absolute end-1 top-1" : "ms-auto"} grid h-3 w-3 shrink-0 place-items-center transition-opacity duration-100 motion-reduce:transition-none ${pending ? "opacity-100 delay-150" : "opacity-0 delay-0"}`}>
    <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
  </span>;
}
