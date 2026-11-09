import { claimAutoReload, saveResume, takeResume } from './aiPlanResume';

describe('Plan with AI resume across a reload', () => {
  it('hands the saved request back once', () => {
    saveResume('Plan the rest of my day');
    expect(takeResume()).toBe('Plan the rest of my day');
    expect(takeResume()).toBeUndefined();
  });
  it('ignores blank requests', () => {
    saveResume('   ');
    expect(takeResume()).toBeUndefined();
  });
});

describe('claimAutoReload', () => {
  it('allows one automatic reload per minute', () => {
    expect(claimAutoReload(1_000_000)).toBe(true);
    expect(claimAutoReload(1_030_000)).toBe(false);
    expect(claimAutoReload(1_061_000)).toBe(true);
  });
});
