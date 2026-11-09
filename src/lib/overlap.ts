export interface Span {
  id: string;
  start: number;
  end: number;
}

export interface Lane {
  /** Zero-based column within the cluster. */
  col: number;
  /** Columns in the cluster this block belongs to; overlapping blocks share the width equally. */
  cols: number;
}

/**
 * Pack overlapping blocks side by side. Blocks that touch only at an edge do not overlap.
 * A cluster is a run of blocks chained by overlap; every block in it gets the cluster's column count.
 */
export function layoutLanes(spans: readonly Span[]): Map<string, Lane> {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const result = new Map<string, Lane>();
  let cluster: { id: string; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const m of cluster) result.set(m.id, { col: m.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };

  for (const s of sorted) {
    if (s.start >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= s.start);
    if (col === -1) col = colEnds.length;
    colEnds[col] = s.end;
    cluster.push({ id: s.id, col });
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  flush();
  return result;
}
