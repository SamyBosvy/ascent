import { describe, expect, it, vi } from 'vitest';
import { IdentityCache, IDENTITY_MAX_AGE_MS, refreshIdentity } from './identityCache';
const owner = { user: { id: 'owner' }, role: 'owner' };
describe('navigation identity cache', () => {
  it('returns a fresh matching identity without another verification', async () => {
    const cache = new IdentityCache(() => 100);
    const verify = vi.fn(async () => owner);
    await cache.verify(verify);
    expect(cache.read('owner')).toEqual(owner);
    expect(cache.expired).toBe(false);
    expect(verify).toHaveBeenCalledTimes(1);
  });
  it('expires after ten minutes while retaining identity for nonblocking refresh', async () => {
    let now = 0;
    const cache = new IdentityCache(() => now);
    await cache.verify(async () => owner);
    now = 599999;
    expect(cache.expired).toBe(false);
    now = 600000;
    expect(IDENTITY_MAX_AGE_MS).toBe(600000);
    expect(cache.expired).toBe(true);
    expect(cache.read('owner')).toEqual(owner);
  });
  it('never returns another user’s identity', async () => {
    const cache = new IdentityCache();
    await cache.verify(async () => owner);
    expect(cache.read('member')).toBeNull();
    expect(cache.read('owner')).toBeNull();
  });
  it('revocation clears identity and signs out', async () => {
    const cache = new IdentityCache();
    await cache.verify(async () => owner);
    const signOut = vi.fn(async () => {});
    await refreshIdentity(cache, {
      sessionUserId: async () => 'owner', verify: async () => { throw new Error('revoked'); },
      isRevoked: () => true, onRevoked: signOut,
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(cache.read('owner')).toBeNull();
  });
  it('missing session signs out and clears identity', async () => {
    const cache = new IdentityCache();
    await cache.verify(async () => owner);
    const signOut = vi.fn(async () => {});
    const verify = vi.fn(async () => owner);
    await refreshIdentity(cache, { sessionUserId: async () => null, verify, isRevoked: () => true, onRevoked: signOut });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
    expect(cache.read('owner')).toBeNull();
  });
  it('network failures retain identity and do not sign out', async () => {
    const cache = new IdentityCache();
    await cache.verify(async () => owner);
    const signOut = vi.fn(async () => {});
    await refreshIdentity(cache, { sessionUserId: async () => 'owner', verify: async () => { throw new Error('network'); }, isRevoked: () => false, onRevoked: signOut });
    expect(signOut).not.toHaveBeenCalled();
    expect(cache.read('owner')).toEqual(owner);
  });
  it('sign-out during verification cannot restore an old identity', async () => {
    const cache = new IdentityCache();
    let finish: ((value: typeof owner) => void) | undefined;
    const pending = cache.verify(() => new Promise(resolve => { finish = resolve; }));
    cache.clear();
    finish?.(owner);
    expect(await pending).toBeNull();
    expect(cache.read('owner')).toBeNull();
  });
  it('deduplicates concurrent background verifications', async () => {
    const cache = new IdentityCache();
    const verify = vi.fn(async () => owner);
    await Promise.all([cache.verify(verify), cache.verify(verify)]);
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
