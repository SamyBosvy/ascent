export const IDENTITY_MAX_AGE_MS = 10 * 60 * 1000;
export type VerifiedIdentity = { user: { id: string }; role: string };

// Navigation optimisation only; database/server authorization stays independent.
export class IdentityCache<T extends VerifiedIdentity> {
  private identity: T | null = null;
  private verifiedAt = 0;
  private generation = 0;
  private pending: Promise<T | null> | null = null;
  constructor(private readonly now: () => number = Date.now) {}
  clear() {
    this.generation += 1;
    this.identity = null;
    this.verifiedAt = 0;
    this.pending = null;
  }
  read(userId: string | null): T | null {
    if (this.identity && this.identity.user.id !== userId) this.clear();
    return this.identity;
  }
  get expired() {
    return !this.identity || this.now() - this.verifiedAt >= IDENTITY_MAX_AGE_MS;
  }
  verify(fetchIdentity: () => Promise<T>): Promise<T | null> {
    if (this.pending) return this.pending;
    const generation = this.generation;
    const request = fetchIdentity().then((identity) => {
      if (generation !== this.generation) return null;
      this.identity = identity;
      this.verifiedAt = this.now();
      return identity;
    }).finally(() => {
      if (this.pending === request) this.pending = null;
    });
    this.pending = request;
    return request;
  }
}

export async function refreshIdentity<T extends VerifiedIdentity>(cache: IdentityCache<T>, deps: {
  sessionUserId: () => Promise<string | null>;
  verify: () => Promise<T>;
  onRevoked: () => Promise<void>;
  isRevoked: (error: unknown) => boolean;
}) {
  const userId = await deps.sessionUserId();
  cache.read(userId);
  if (!userId) {
    cache.clear();
    await deps.onRevoked();
    return;
  }
  try {
    await cache.verify(deps.verify);
  } catch (error) {
    if (!deps.isRevoked(error)) return; // Network failures never revoke cached access.
    cache.clear();
    await deps.onRevoked();
  }
}
