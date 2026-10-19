import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useApp } from '../store/useApp';
import { computeSchedule } from '../utils/scheduler';
import {
  addCalendarDays,
  calendarDaysBetween,
  dayOfMonth,
  dayNameShort,
  monthName,
  todayISO,
  yearOf,
} from '../utils/dateUtils';
import {
  durationToEndDate,
  eachDay,
  isWorkingDay,
  toPrevWorkingDay,
  toWorkingDay,
  workingDaysInclusive,
} from '../utils/workingCalendar';
import type { ISODate, Tugas } from '../types';
import './Gantt.css';

const LABEL_W = 240; // lebar kolom label (px) — harus sama dengan --lw di Gantt.css
const ROW_H = 38;
const GROUP_H = 30;

type DragMode = 'move' | 'left' | 'right';
interface DragState {
  id: string;
  mode: DragMode;
  startX: number;
  origStart: ISODate;
  origEnd: ISODate;
  origDur: number;
}

interface Row {
  kind: 'group' | 'task';
  id: string;
  name: string;
  color: string;
  task?: Tugas;
  parentId?: string;
}

const ZOOM = [22, 30, 40, 56];

export function GanttView() {
  const { state, dispatch } = useApp();
  const [zoomIdx, setZoomIdx] = useState(2);
  const DAY_W = ZOOM[zoomIdx] ?? 40;
  const [ghost, setGhost] = useState<{ id: string; startDate: ISODate; duration: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const kal = state.kalender;
  const schedule = useMemo(
    () => computeSchedule(state.tugas, state.dependensi, kal),
    [state.tugas, state.dependensi, kal],
  );

  // ── Rentang tanggal (diberi padding agar panah muat) ──
  const rangeStart = schedule.projectStart
    ? addCalendarDays(schedule.projectStart, -1)
    : addCalendarDays(todayISO(), -3);
  const rangeEnd = schedule.projectEnd
    ? addCalendarDays(schedule.projectEnd, 4)
    : addCalendarDays(todayISO(), 11);
  const days = eachDay(rangeStart, rangeEnd);
  const trackW = days.length * DAY_W;

  // ── Baris (per kegiatan, lalu tugas urut jadwal) ──
  const model = useMemo(() => {
    const rows: Row[] = [];
    for (const k of state.kegiatan) {
      rows.push({
        kind: 'group',
        id: k.id,
        name: k.name,
        color: k.color ?? '#64748b',
      });
      const list = state.tugas
        .filter((t) => t.activityId === k.id)
        .slice()
        .sort((a, b) => {
          const sa = schedule.tasks.get(a.id)?.startDate ?? '';
          const sb = schedule.tasks.get(b.id)?.startDate ?? '';
          if (sa !== sb) return sa < sb ? -1 : 1;
          return a.name.localeCompare(b.name, 'id');
        });
      for (const t of list) {
        rows.push({
          kind: 'task',
          id: t.id,
          name: t.name,
          color: k.color ?? '#64748b',
          task: t,
          parentId: t.parentId,
        });
      }
    }
    const pos = new Map<string, { y: number; h: number }>();
    let y = 0;
    for (const r of rows) {
      if (r.kind === 'group') y += GROUP_H;
      else {
        pos.set(r.id, { y, h: ROW_H });
        y += ROW_H;
      }
    }
    return { rows, pos, height: y };
  }, [state.kegiatan, state.tugas, schedule]);

  // ── Geometri bar (memakai ghost bila sedang digeser) ──
  const barGeometry = (taskId: string): { xDays: number; wDays: number } | null => {
    const s = schedule.tasks.get(taskId);
    if (!s) return null;
    let start = s.startDate;
    let end = s.endDate;
    if (ghost && ghost.id === taskId) {
      start = ghost.startDate;
      end = durationToEndDate(ghost.startDate, ghost.duration, kal);
    }
    const xDays = Math.max(0, calendarDaysBetween(rangeStart, start));
    const wDays = Math.max(1, calendarDaysBetween(start, end) + 1);
    return { xDays, wDays };
  };

  // ── Logika drag ──
  const hitungDrag = (d: DragState, dx: number): { startDate: ISODate; duration: number } => {
    const delta = Math.round(dx / DAY_W);
    if (d.mode === 'move') {
      const startDate = toWorkingDay(addCalendarDays(d.origStart, delta), kal);
      return { startDate, duration: d.origDur };
    }
    if (d.mode === 'left') {
      let startDate = toWorkingDay(addCalendarDays(d.origStart, delta), kal);
      if (startDate >= d.origEnd) startDate = toPrevWorkingDay(addCalendarDays(d.origEnd, -1), kal);
      const duration = Math.max(1, workingDaysInclusive(startDate, d.origEnd, kal));
      return { startDate, duration };
    }
    let newEnd = addCalendarDays(d.origEnd, delta);
    if (newEnd <= d.origStart) newEnd = d.origStart;
    const duration = Math.max(1, workingDaysInclusive(d.origStart, newEnd, kal));
    return { startDate: d.origStart, duration };
  };

  const beginDrag = (e: ReactPointerEvent<HTMLElement>, task: Tugas, mode: DragMode) => {
    if (!schedule.ok) return;
    e.stopPropagation();
    e.preventDefault();
    const s = schedule.tasks.get(task.id);
    if (!s) return;
    const geo = barGeometry(task.id);
    if (!geo) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // browser lama tanpa pointer capture → drag tetap jalan dalam elemen
    }
    dragRef.current = {
      id: task.id,
      mode,
      startX: e.clientX,
      origStart: s.startDate,
      origEnd: s.endDate,
      origDur: Math.max(1, workingDaysInclusive(s.startDate, s.endDate, kal)),
    };
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const next = hitungDrag(d, e.clientX - d.startX);
    setGhost((prev) =>
      prev && prev.id === d.id && prev.startDate === next.startDate && prev.duration === next.duration
        ? prev
        : { id: d.id, ...next },
    );
  };

  const endDrag = (e: ReactPointerEvent<HTMLElement>, commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!commit) {
      setGhost(null);
      return;
    }
    const next = hitungDrag(d, e.clientX - d.startX);
    const task = state.tugas.find((t) => t.id === d.id);
    setGhost(null);
    if (task && (next.startDate !== task.startDate || next.duration !== task.duration)) {
      dispatch({
        type: 'UPDATE_TUGAS',
        payload: { ...task, startDate: next.startDate, duration: next.duration },
      });
    }
  };

  // ── Header bulan ──
  const monthSegments: { label: string; count: number }[] = [];
  for (const d of days) {
    const label = `${monthName(d)} ${yearOf(d)}`;
    const last = monthSegments[monthSegments.length - 1];
    if (last && last.label === label) last.count += 1;
    else monthSegments.push({ label, count: 1 });
  }

  const hariIni = todayISO();
  const todayIdx = calendarDaysBetween(rangeStart, hariIni);

  // ── Panah dependensi ──
  const arrows = state.dependensi.flatMap((dep) => {
    const p = model.pos.get(dep.predecessorId);
    const s = model.pos.get(dep.successorId);
    const pg = barGeometry(dep.predecessorId);
    const sg = barGeometry(dep.successorId);
    if (!p || !s || !pg || !sg) return [];
    const x1 = (dep.type === 'FS' ? pg.xDays + pg.wDays : pg.xDays) * DAY_W;
    const y1 = p.y + p.h / 2;
    const x2 = sg.xDays * DAY_W - 7;
    const y2 = s.y + s.h / 2;
    const bend = Math.max(18, Math.min(70, Math.abs(x2 - x1) / 2 + 18));
    const dPath = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
    const kritis =
      schedule.tasks.get(dep.predecessorId)?.isCritical === true &&
      schedule.tasks.get(dep.successorId)?.isCritical === true;
    return [{ id: dep.id, dPath, kritis, label: `${dep.type} lag ${dep.lag ?? 0}` }];
  });

  const warnaKegiatan = state.kegiatan.map((k) => ({ name: k.name, color: k.color ?? '#64748b' }));

  return (
    <div className="view">
      <section className="card gantt-wrap">
        <div className="toolbar">
          <h2>
            Gantt Chart <span className="count">{state.tugas.length} bar</span>
          </h2>
          <div className="toolbar-actions">
            <span className="hint">Geser bar = ubah mulai · Tarik tepi = ubah durasi</span>
            <div className="zoom-controls">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
                disabled={zoomIdx === 0}
                aria-label="Perkecil"
              >
                −
              </button>
              <span className="zoom-label">Zoom</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setZoomIdx((i) => Math.min(ZOOM.length - 1, i + 1))}
                disabled={zoomIdx === ZOOM.length - 1}
                aria-label="Perbesar"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {!schedule.ok ? (
          <p className="error">
            ⚠ Dependensi membentuk siklus — Gantt tidak bisa digambar. Perbaiki di tab Dependensi.
          </p>
        ) : state.tugas.length === 0 ? (
          <p className="empty">Belum ada tugas untuk ditampilkan.</p>
        ) : (
          <>
            <div className="gantt-info">
              <span className="stat">Mulai: {schedule.projectStart}</span>
              <span className="stat">Selesai: {schedule.projectEnd}</span>
              <span className="stat">{schedule.projectDuration} hari kerja</span>
              <span className="stat">
                Kritis: {schedule.criticalIds.length}/{state.tugas.length}
              </span>
            </div>

            <div
              className="gantt-scroll"
              style={{ ['--lw' as string]: `${LABEL_W}px` } as React.CSSProperties}
              onPointerMove={onMove}
              onPointerUp={(e) => endDrag(e, true)}
              onPointerCancel={(e) => endDrag(e, false)}
            >
              <div className="gantt-head" style={{ width: LABEL_W + trackW }}>
                <div className="gantt-corner">
                  <div className="corner-months" />
                  <div className="corner-days">Tugas / tanggal</div>
                </div>
                <div>
                  <div className="gantt-months">
                    {monthSegments.map((m, i) => (
                      <div className="gantt-month" key={`${m.label}-${i}`} style={{ width: m.count * DAY_W }}>
                        {m.count * DAY_W > 56 ? m.label : ''}
                      </div>
                    ))}
                  </div>
                  <div className="gantt-days">
                    {days.map((d) => {
                      const kerja = isWorkingDay(d, kal);
                      const libur = kal.holidays.includes(d);
                      return (
                        <div
                          key={d}
                          className={
                            'gantt-day' +
                            (kerja ? '' : ' off') +
                            (d === hariIni ? ' today' : '')
                          }
                          style={{ width: DAY_W }}
                          title={`${dayNameShort(d)}, ${d}${libur ? ' (libur)' : ''}`}
                        >
                          <span className="d-num">{dayOfMonth(d)}</span>
                          <span className="d-wd">{dayNameShort(d).slice(0, 2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="gantt-body" style={{ width: LABEL_W + trackW, height: model.height }}>
                {/* Persegi bukan-hari-kerja (akhir pekan & libur) */}
                {days.map((d, i) =>
                  isWorkingDay(d, kal) ? null : (
                    <div
                      key={`bg-${d}`}
                      className="gantt-stripe"
                      style={{ left: LABEL_W + i * DAY_W, width: DAY_W }}
                    />
                  ),
                )}
                {/* Penanda hari ini */}
                {todayIdx >= 0 && todayIdx < days.length ? (
                  <div
                    className="gantt-today"
                    style={{ left: LABEL_W + todayIdx * DAY_W + DAY_W / 2 }}
                    title={`Hari ini: ${hariIni}`}
                  />
                ) : null}

                {model.rows.map((r) =>
                  r.kind === 'group' ? (
                    <div className="gantt-row group" key={`g-${r.id}`}>
                      <div className="gantt-label">
                        <span className="dot" style={{ background: r.color }} aria-hidden="true" />
                        <span className="gantt-group-name">{r.name}</span>
                      </div>
                      <div className="gantt-track" style={{ width: trackW }} />
                    </div>
                  ) : (
                    <div className="gantt-row" key={`t-${r.id}`}>
                      <div
                        className="gantt-label"
                        title={`${r.name}${r.parentId ? ' (sub-tugas)' : ''}`}
                      >
                        {r.parentId ? <span className="indent">└</span> : null}
                        <span className="gantt-task-name">{r.name}</span>
                      </div>
                      <div className="gantt-track" style={{ width: trackW }}>
                        {(() => {
                          const task = r.task as Tugas;
                          const geo = barGeometry(task.id);
                          if (!geo) return null;
                          const s = schedule.tasks.get(task.id);
                          const prog = Math.min(100, Math.max(0, task.progress ?? 0));
                          const title = [
                            task.name,
                            `${s?.startDate} → ${s?.endDate} (${task.duration} hari kerja)`,
                            `Progres: ${prog}%`,
                            s?.isCritical ? '★ Jalur kritis' : s ? `Slack: ${s.slackDays} hari` : '',
                          ]
                            .filter(Boolean)
                            .join('\n');
                          return (
                            <div
                              className={'gantt-bar' + (s?.isCritical ? ' critical' : '')}
                              style={{
                                left: geo.xDays * DAY_W + 2,
                                width: geo.wDays * DAY_W - 4,
                                background: r.color,
                              }}
                              title={title}
                              aria-label={title}
                              onPointerDown={(e) => beginDrag(e, task, 'move')}
                            >
                              <div className="gantt-bar-fill" style={{ width: `${prog}%` }} />
                              <span className="gantt-bar-name">{task.name}</span>
                              <div
                                className="grip grip-l"
                                aria-hidden="true"
                                onPointerDown={(e) => beginDrag(e, task, 'left')}
                              />
                              <div
                                className="grip grip-r"
                                aria-hidden="true"
                                onPointerDown={(e) => beginDrag(e, task, 'right')}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ),
                )}

                {/* Panah dependensi (SVG di atas track, di bawah label sticky) */}
                <svg
                  className="gantt-svg"
                  width={trackW}
                  height={model.height}
                  style={{ left: LABEL_W, top: 0 }}
                  aria-hidden="true"
                >
                  <defs>
                    <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                    </marker>
                    <marker id="arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0,0 L8,4 L0,8 z" fill="#ef4444" />
                    </marker>
                  </defs>
                  {arrows.map((a) => (
                    <path
                      key={a.id}
                      d={a.dPath}
                      fill="none"
                      stroke={a.kritis ? '#ef4444' : '#64748b'}
                      strokeWidth={1.6}
                      strokeDasharray={a.kritis ? undefined : '5 3'}
                      markerEnd={a.kritis ? 'url(#arrow-crit)' : 'url(#arrow)'}
                    >
                      <title>{a.label}</title>
                    </path>
                  ))}
                </svg>
              </div>
            </div>

            <div className="gantt-legend">
              {warnaKegiatan.map((k) => (
                <span key={k.name} className="legend-item">
                  <span className="dot" style={{ background: k.color }} /> {k.name}
                </span>
              ))}
              <span className="legend-item">
                <span className="legend-crit" /> jalur kritis
              </span>
              <span className="legend-item">
                <span className="legend-off" /> akhir pekan / libur
              </span>
              <span className="legend-item">
                <span className="legend-today" /> hari ini
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
