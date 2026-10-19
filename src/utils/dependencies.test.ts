import { describe, expect, it } from 'vitest';
import type { Dependensi, Tugas } from '../types';
import {
  buildAdjacency,
  buildReverseAdjacency,
  dependencyIssueMessage,
  hasCycle,
  rootTaskIds,
  topoSort,
  validateDependency,
  wouldCreateDependencyCycle,
} from './dependencies';

const T = (id: string, extra: Partial<Tugas> = {}): Tugas => ({
  id,
  activityId: 'k1',
  name: `Tugas ${id}`,
  duration: 1,
  ...extra,
});
const DEP = (id: string, p: string, s: string, type: 'FS' | 'SS' = 'FS'): Dependensi => ({
  id,
  predecessorId: p,
  successorId: s,
  type,
});

const tugas = [T('t1'), T('t2'), T('t3')];
const deps = [DEP('d1', 't1', 't2'), DEP('d2', 't2', 't3'), DEP('d3', 't1', 't1'), DEP('d4', 't1', 'ghost')];

describe('dependencies — graf', () => {
  it('membuang self-loop & edge rusak saat membangun adjacency', () => {
    const adj = buildAdjacency(tugas, deps);
    expect(adj.get('t1')).toEqual(['t2']);
    expect(adj.get('t2')).toEqual(['t3']);
    expect(adj.get('t3')).toEqual([]);
  });

  it('membangun adjacency terbalik', () => {
    const radj = buildReverseAdjacency(tugas, deps);
    expect(radj.get('t2')).toEqual(['t1']);
    expect(radj.get('t3')).toEqual(['t2']);
    expect(radj.get('t1')).toEqual([]);
  });
});

describe('dependencies — topologi & siklus', () => {
  it('mengurutkan DAG sesuai edge', () => {
    const r = topoSort(tugas, deps.slice(0, 2));
    expect(r.cyclicIds).toEqual([]);
    expect(r.order.indexOf('t1')).toBeLessThan(r.order.indexOf('t2'));
    expect(r.order.indexOf('t2')).toBeLessThan(r.order.indexOf('t3'));
    expect(hasCycle(tugas, deps.slice(0, 2))).toBe(false);
  });

  it('mendeteksi siklus t1→t2→t3→t1', () => {
    const cyclic = [DEP('d1', 't1', 't2'), DEP('d2', 't2', 't3'), DEP('d3', 't3', 't1')];
    const r = topoSort(tugas, cyclic);
    expect(r.cyclicIds.length).toBeGreaterThan(0);
    expect(hasCycle(tugas, cyclic)).toBe(true);
  });

  it('menangani data kosong', () => {
    expect(topoSort([], []).order).toEqual([]);
    expect(hasCycle([], [])).toBe(false);
    expect(rootTaskIds([], [])).toEqual([]);
  });

  it('menemukan tugas akar', () => {
    expect(rootTaskIds(tugas, deps.slice(0, 2))).toEqual(['t1']);
  });
});

describe('dependencies — validasi edge', () => {
  it('mendeteksi siklus saat menambah edge balik', () => {
    expect(wouldCreateDependencyCycle(tugas, deps.slice(0, 2), 't3', 't1')).toBe(true);
    expect(wouldCreateDependencyCycle(tugas, deps.slice(0, 2), 't1', 't3')).toBe(false);
    expect(wouldCreateDependencyCycle(tugas, [], 't1', 't1')).toBe(true);
  });

  it('memvalidasi kandidat dependensi', () => {
    expect(validateDependency(tugas, [], { predecessorId: 't1', successorId: 't2' })).toBe(null);
    expect(validateDependency(tugas, [], { predecessorId: 'ghost', successorId: 't2' })).toBe('predecessor-missing');
    expect(validateDependency(tugas, [], { predecessorId: 't1', successorId: 'ghost' })).toBe('successor-missing');
    expect(validateDependency(tugas, [], { predecessorId: 't1', successorId: 't1' })).toBe('self');
    expect(validateDependency(tugas, [DEP('d1', 't1', 't2')], { predecessorId: 't1', successorId: 't2' })).toBe('duplicate');
    // id sendiri dikecualikan saat UPDATE
    expect(validateDependency(tugas, [DEP('d1', 't1', 't2')], { predecessorId: 't1', successorId: 't2' }, 'd1')).toBe(null);
    expect(validateDependency(tugas, deps.slice(0, 2), { predecessorId: 't3', successorId: 't1' })).toBe('cycle');
  });

  it('pesan penolakan selalu berbahasa Indonesia dan terisi', () => {
    for (const iss of ['predecessor-missing', 'successor-missing', 'self', 'duplicate', 'cycle'] as const) {
      const m = dependencyIssueMessage(iss);
      expect(m.length).toBeGreaterThan(0);
      expect(m).not.toContain('undefined');
    }
  });
});
