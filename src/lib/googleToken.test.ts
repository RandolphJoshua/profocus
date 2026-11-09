import { beforeEach, describe, expect, it } from 'vitest';
import { isFresh, loadGoogleToken, saveGoogleToken } from './googleToken';

const KEY = 'profocus:gtoken';

beforeEach(() => localStorage.clear());

describe('isFresh', () => {
  it('is false for null', () => expect(isFresh(null)).toBe(false));
  it('is true when more than a minute remains', () => {
    expect(isFresh({ accessToken: 'a', expiresAt: 200_000 }, 100_000)).toBe(true);
  });
  it('is false inside the one-minute safety margin', () => {
    expect(isFresh({ accessToken: 'a', expiresAt: 150_000 }, 100_000)).toBe(false);
    expect(isFresh({ accessToken: 'a', expiresAt: 160_000 }, 100_000)).toBe(false);
  });
  it('is false once expired', () => expect(isFresh({ accessToken: 'a', expiresAt: 50 }, 100)).toBe(false));
});

describe('save and load', () => {
  it('round-trips a token with a refresh token', () => {
    saveGoogleToken({ accessToken: 'a', expiresAt: 1_000_000, refreshToken: 'r' });
    expect(loadGoogleToken(10)).toEqual({ accessToken: 'a', expiresAt: 1_000_000, refreshToken: 'r' });
  });
  it('returns null when nothing is stored', () => expect(loadGoogleToken()).toBeNull());
  it('keeps an expired token that can still be refreshed', () => {
    saveGoogleToken({ accessToken: 'a', expiresAt: 5, refreshToken: 'r' });
    expect(loadGoogleToken(1_000)?.refreshToken).toBe('r');
  });
  it('drops an expired token that has no refresh token', () => {
    saveGoogleToken({ accessToken: 'a', expiresAt: 5 });
    expect(loadGoogleToken(1_000)).toBeNull();
  });
  it('saving null clears the entry', () => {
    saveGoogleToken({ accessToken: 'a', expiresAt: 1_000_000 });
    saveGoogleToken(null);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
  it('treats corrupt storage as empty', () => {
    localStorage.setItem(KEY, '{nope');
    expect(loadGoogleToken()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ accessToken: 5, expiresAt: 'x' }));
    expect(loadGoogleToken()).toBeNull();
    localStorage.setItem(KEY, 'null');
    expect(loadGoogleToken()).toBeNull();
  });
  it('ignores a non-string refresh token', () => {
    localStorage.setItem(KEY, JSON.stringify({ accessToken: 'a', expiresAt: 9e12, refreshToken: 4 }));
    expect(loadGoogleToken()).toEqual({ accessToken: 'a', expiresAt: 9e12 });
  });
});
