import { layoutLanes } from './overlap';

const span = (id: string, start: number, end: number) => ({ id, start, end });

describe('layoutLanes', () => {
  it('gives a lone block the full width', () => {
    expect(layoutLanes([span('a', 0, 60)]).get('a')).toEqual({ col: 0, cols: 1 });
  });

  it('does not split blocks that only touch', () => {
    const l = layoutLanes([span('a', 0, 60), span('b', 60, 120)]);
    expect(l.get('a')?.cols).toBe(1);
    expect(l.get('b')?.cols).toBe(1);
  });

  it('puts two overlapping blocks side by side', () => {
    const l = layoutLanes([span('a', 0, 120), span('b', 60, 90)]);
    expect(l.get('a')).toEqual({ col: 0, cols: 2 });
    expect(l.get('b')).toEqual({ col: 1, cols: 2 });
  });

  it('reuses a free column inside a chain and keeps the cluster width equal', () => {
    const l = layoutLanes([span('a', 0, 60), span('b', 30, 120), span('c', 70, 100)]);
    expect(l.get('a')).toEqual({ col: 0, cols: 2 });
    expect(l.get('b')).toEqual({ col: 1, cols: 2 });
    expect(l.get('c')).toEqual({ col: 0, cols: 2 });
  });

  it('starts a fresh cluster after a gap', () => {
    const l = layoutLanes([span('a', 0, 60), span('b', 0, 60), span('c', 120, 180)]);
    expect(l.get('a')?.cols).toBe(2);
    expect(l.get('c')).toEqual({ col: 0, cols: 1 });
  });

  it('is stable for identical spans', () => {
    const a = layoutLanes([span('x', 0, 60), span('y', 0, 60)]);
    const b = layoutLanes([span('y', 0, 60), span('x', 0, 60)]);
    expect(a.get('x')).toEqual(b.get('x'));
  });
});
