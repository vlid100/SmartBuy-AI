import type { SourceSearchState, SourceSearchStatus } from "@/lib/types";

export type RouterTier = "stable" | "probe";
export type RouterPhase = "primary" | "expanded" | "cooldown" | "not-selected";
export type RouterHealthLabel = "strong" | "normal" | "weak" | "unknown";

export type RouterSourceLike = {
  id: string;
  tier: RouterTier;
};

type HealthRecord = {
  runs: number;
  ok: number;
  empty: number;
  blocked: number;
  timeout: number;
  error: number;
  avgMs: number;
  failureStreak: number;
  lastState?: SourceSearchState;
  lastSuccessAt?: number;
  lastUpdatedAt?: number;
  cooldownUntil?: number;
};

type RouterGlobal = typeof globalThis & {
  __smartbuySourceRouterHealth?: Map<string, HealthRecord>;
};

const globalRouter = globalThis as RouterGlobal;
const healthStore = globalRouter.__smartbuySourceRouterHealth || new Map<string, HealthRecord>();
globalRouter.__smartbuySourceRouterHealth = healthStore;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function nowMs() { return Date.now(); }

function initialRecord(): HealthRecord {
  return { runs: 0, ok: 0, empty: 0, blocked: 0, timeout: 0, error: 0, avgMs: 0, failureStreak: 0 };
}

function cooldownFor(state: SourceSearchState, failureStreak: number) {
  if (state === "blocked") return 12 * 60_000;
  if (state === "timeout" && failureStreak >= 2) return 5 * 60_000;
  if (state === "error" && failureStreak >= 2) return 3 * 60_000;
  return 0;
}

export function recordSourceOutcome(source: RouterSourceLike, status: SourceSearchStatus) {
  if (status.cached || status.state === "not-run") return routerSnapshot(source);
  const current = healthStore.get(source.id) || initialRecord();
  const next: HealthRecord = { ...current };
  next.runs += 1;
  next.lastState = status.state;
  next.lastUpdatedAt = nowMs();
  if (status.durationMs > 0) next.avgMs = current.avgMs > 0 ? Math.round(current.avgMs * 0.72 + status.durationMs * 0.28) : status.durationMs;

  if (status.state === "ok") {
    next.ok += 1;
    next.failureStreak = 0;
    next.lastSuccessAt = nowMs();
    next.cooldownUntil = undefined;
  } else if (status.state === "empty") {
    next.empty += 1;
    next.failureStreak = Math.max(0, current.failureStreak - 1);
  } else if (status.state === "blocked") {
    next.blocked += 1;
    next.failureStreak += 1;
  } else if (status.state === "timeout") {
    next.timeout += 1;
    next.failureStreak += 1;
  } else if (status.state === "error") {
    next.error += 1;
    next.failureStreak += 1;
  }

  const cooldownMs = source.tier === "probe" ? cooldownFor(status.state, next.failureStreak) : 0;
  if (cooldownMs) next.cooldownUntil = nowMs() + cooldownMs;
  healthStore.set(source.id, next);
  return routerSnapshot(source);
}

function scoreFor(source: RouterSourceLike, record: HealthRecord) {
  const base = source.tier === "stable" ? 72 : 58;
  if (!record.runs) return base;
  const runs = Math.max(1, record.runs);
  const okRate = record.ok / runs;
  const blockedRate = record.blocked / runs;
  const timeoutRate = record.timeout / runs;
  const errorRate = record.error / runs;
  const emptyRate = record.empty / runs;
  const latencyPenalty = record.avgMs > 0 ? clamp((record.avgMs - 900) / 110, 0, 16) : 0;
  const recentSuccessBonus = record.lastSuccessAt && nowMs() - record.lastSuccessAt < 30 * 60_000 ? 6 : 0;
  const streakPenalty = Math.min(18, record.failureStreak * 6);
  const score = base + okRate * 30 - blockedRate * 30 - timeoutRate * 18 - errorRate * 16 - emptyRate * 6 - latencyPenalty - streakPenalty + recentSuccessBonus;
  return Math.round(clamp(score, 5, 99));
}

export function routerSnapshot(source: RouterSourceLike) {
  const record = healthStore.get(source.id) || initialRecord();
  const score = scoreFor(source, record);
  const coolingDown = source.tier === "probe" && Boolean(record.cooldownUntil && record.cooldownUntil > nowMs());
  const healthLabel: RouterHealthLabel = record.runs === 0 ? "unknown" : score >= 76 ? "strong" : score >= 50 ? "normal" : "weak";
  return {
    score,
    healthLabel,
    coolingDown,
    cooldownUntil: coolingDown ? record.cooldownUntil : undefined,
    runs: record.runs,
    failureStreak: record.failureStreak,
    avgMs: record.avgMs,
    lastState: record.lastState,
  };
}

function queryJitter(query: string, sourceId: string) {
  let h = 0;
  const value = `${query.toLowerCase()}|${sourceId}`;
  for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

export function rankSources<T extends RouterSourceLike>(sources: T[], query: string) {
  return [...sources].sort((a, b) => {
    const aa = routerSnapshot(a);
    const bb = routerSnapshot(b);
    const scoreA = aa.score + (a.tier === "stable" ? 8 : 0) + queryJitter(query, a.id) * 2;
    const scoreB = bb.score + (b.tier === "stable" ? 8 : 0) + queryJitter(query, b.id) * 2;
    return scoreB - scoreA;
  });
}

export function isCoolingDown(source: RouterSourceLike) {
  return routerSnapshot(source).coolingDown;
}

export function decorateRouterStatus(source: RouterSourceLike, status: SourceSearchStatus, phase: RouterPhase): SourceSearchStatus {
  const snapshot = routerSnapshot(source);
  return {
    ...status,
    routerScore: snapshot.score,
    routerHealth: snapshot.healthLabel,
    routerPhase: phase,
    cooldownUntil: snapshot.cooldownUntil ? new Date(snapshot.cooldownUntil).toISOString() : undefined,
  };
}

export function recordAndDecorateRouterStatus(source: RouterSourceLike, status: SourceSearchStatus, phase: RouterPhase): SourceSearchStatus {
  const snapshot = recordSourceOutcome(source, status);
  return {
    ...status,
    routerScore: snapshot.score,
    routerHealth: snapshot.healthLabel,
    routerPhase: phase,
    cooldownUntil: snapshot.cooldownUntil ? new Date(snapshot.cooldownUntil).toISOString() : undefined,
  };
}

export function routerCooldownMessage(source: RouterSourceLike) {
  const snapshot = routerSnapshot(source);
  if (!snapshot.coolingDown || !snapshot.cooldownUntil) return undefined;
  const time = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(snapshot.cooldownUntil);
  return `адаптивна пауза до ${time} після нестабільних відповідей`;
}

export function sourceRouterSummary<T extends RouterSourceLike>(sources: T[]) {
  return sources.map(source => ({ id: source.id, tier: source.tier, ...routerSnapshot(source) }));
}
