/**
 * Hosts a poem's `facsimile.src` may point to, besides files in `public/`.
 *
 * `lib/poems.tsx` checks every facsimile against this list, and
 * `next.config.ts` turns it into `images.remotePatterns`, so the two never
 * disagree. Add a host only after checking that its scans may be shown here
 * (BNP's terms of use, for the espólio).
 */
export const FACSIMILE_HOSTS: readonly string[] = [];
