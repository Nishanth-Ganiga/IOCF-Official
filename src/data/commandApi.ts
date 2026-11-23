/**
 * Client for the Command Center API (/api/command/*, see server/command/handler.mjs).
 * The session is an HttpOnly cookie the server sets: this code never sees or stores a token, and every permission is
 * decided by the server — what the screen shows is only ever a reflection of what the server allowed.
 */

export type Role = 'admin' | 'board';

export type CcUser = {
  accountId: string;
  role: Role;
  username: string;
  /** Board slug (board accounts only). */
  board: string | null;
  boardName: string | null;
  chairmanName: string | null;
};

export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/command${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-iocf-request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the Command Center. Check your connection and try again.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON (for example a hosting error page) */
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; retryAfter?: number } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? (res.status === 404 ? 'The Command Center backend is not available here.' : 'Something went wrong. Please try again.'), e?.retryAfter);
  }
  return data as T;
}

export type DashboardInfo = { board: string; preview: boolean; chairmanName: string | null; modules: string[]; /** Series invitations waiting for this board. */ invitations: number; /** IOCF 2.0 salary months waiting for this board to submit. */ salaryActions?: number };

/** One Build a Stadium request (the level and the cost are always the server's: level 3, ₹30,000). */
export type StadiumRequest = {
  id: string;
  board: string;
  boardName: string;
  name: string;
  place: string;
  venue: string;
  level: number;
  cost: number;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  requestedBy: string | null;
  requestedAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
  declineReason: string | null;
};
export type StadiumsInfo = {
  level: number;
  cost: number;
  country: string;
  canAct: boolean;
  maxPending: number;
  stadiums: { name: string; venue: string | null; level: number | null }[];
  pending: StadiumRequest[];
  /** Requests the administrator did not accept, until the board dismisses the message. */
  notices: StadiumRequest[];
};
export type AdminStadiums = { level: number; cost: number; pending: StadiumRequest[]; recent: StadiumRequest[] };

/* ---------- IOCF 2.0: Player Salary Program ---------- */
export type PspSchedule = { announce: string; submitFrom: string; submitUntil: string; verifyFrom: string; verifyUntil: string; deadlineAt: number };
export type PspMonth = {
  key: string; label: string; year: number; month: number; status: string; statusLabel: string; enabled: boolean; submissionOpen: boolean; activatedBy: string | null; activatedAt: number | null;
  deadlineAt: number; deadlineMoved: boolean; note: string | null; rankingsPublished: boolean; rankingsPublishedAt: number | null; schedule: PspSchedule;
};
export type PspLine = { category: string; categoryLabel?: string; key: string; name?: string; designation?: string | null; umpire?: boolean; salary: number | null };
export type PspRequest = {
  id: string; month: string; monthLabel: string; board: string; boardName?: string; version: number; status: string; statusLabel: string; council: string | null; rank: number | null; allocation: number; total: number;
  remaining: number; late: boolean; players: number; lines: PspLine[]; createdAt: number; submittedAt: number | null; submittedBy: string | null; reviewedAt: number | null; decidedAt: number | null; decidedBy: string | null;
  reason: string | null; creditedAt: number | null;
};
export type PspRequestDetail = PspRequest & {
  checks: { problems: string[]; umpireVerification: { name: string; category: string; umpire: boolean }[]; specialContractUmpire: boolean; eliteHasUmpire: boolean; officials: { name: string; designation: string; category: string }[]; multiplesOf100: boolean; totalMatchesAllocation: boolean; allRegistered: boolean };
  breakdown: { category: string; weightBp: number; pool: number; players: number; share: number; leftover: number }[];
  categoryTotals: { category: string; label: string; players: number; total: number }[];
  versions: { id: string; version: number; status: string; statusLabel: string; submittedAt: number | null; decidedAt: number | null; reason: string | null }[];
};
export type PspRecord = { id: string; month: string; monthLabel: string; year: number; board: string; boardName: string; playerKey: string; player: string; designation: string | null; category: string; categoryLabel: string; salary: number; status: string; creditedAt: number; reference: string };
export type PspOverview = {
  year: number; month: string | null; years: number[]; monthlyFunding: number; annualFunding: number; assignedBoards: number; totalBoards: number; publishedMonths: number; boardsWithRankings: number; awaiting: number; submitted: number;
  underReview: number; approved: number; rejected: number; credited: number; drafts: number; totalAllocated: number; totalDistributed: number; configComplete: boolean;
  councils: { id: string; name: string; color: string; assigned: number; ranks: number; monthlyFunding: number; allocated: number; distributed: number; submitted: number; credited: number }[];
  boards: { month: string; monthLabel: string; board: string; boardName: string; council: string; councilId: string; rank: number; funding: number; status: string; statusLabel: string; total: number; late: boolean }[];
};
export type PspBoardMonth = {
  month: PspMonth; board: string; boardName: string; council: string | null; rank: number | null; allocation: number | null; configComplete: boolean; configProblem: string | null;
  weights: Record<string, number> | null; state: { status: string | null; canEdit: boolean; code: string | null; message: string | null };
  roster: { key: string; name: string; umpire: boolean; designation: string | null }[]; categories: { id: string; label: string; max: number | null }[]; request: PspRequest | null;
  previous: { id: string; version: number; status: string; statusLabel: string; reason: string | null; decidedAt: number | null }[];
};
export type PspBoardList = {
  board: string; boardName: string; council: string | null; configComplete: boolean; configProblem: string | null; canAct: boolean;
  months: (PspMonth & { council: string | null; rank: number | null; allocation: number | null; request: { id: string; version: number; status: string; statusLabel: string; total: number; reason: string | null; submittedAt: number | null; decidedAt: number | null } | null })[];
};
export type PspPlayerRecords = { key: string; name: string; designation: string | null; umpire: boolean; records: PspRecord[]; verifiedMonths: number; consecutive: number; best: number; topClassReady: boolean };

export type Overview = {
  totalBoards: number;
  totalAccounts: number;
  activeBoardAccounts: number;
  inactiveBoardAccounts: number;
  boardsWithoutAccount: number;
  availableModules: number;
  /** Build a Stadium requests waiting for a decision. */
  pendingStadiumRequests?: number;
  /** IOCF 2.0 salary requests waiting for a decision. */
  pendingSalaryRequests?: number;
  /** Is the private mirror sheet set up on the server? */
  mirrorConfigured?: boolean;
  recentActivity: ActivityEntry[];
};

export type ActivityEntry = { at: string; action: string; label: string; actor: string | null; target: string | null };

export type BoardAccount = {
  slug: string;
  name: string;
  accountId: string | null;
  username: string | null;
  status: 'active' | 'inactive' | 'none';
  chairmanName: string | null;
  lastLoginAt: string | null;
  modules: { id: string; enabled: boolean }[];
};

export type AccountsInfo = { admin: { accountId: string; username: string; status: string; lastLoginAt: string | null } | null; boards: BoardAccount[] };

export type SeriesInput = {
  /** The squad announcement: the keys of the chosen players (from the board's registered players). */
  squad?: string[];
  /** Matches a day: 1 (default) or 2 (quadrilateral series only). */
  perDay?: number;
  name: string;
  type: string;
  opponents: string[];
  matches: number;
  stadiums: string[];
  /** One date (YYYY-MM-DD) per scheduled match. */
  dates: string[];
  bet: number;
  format: string;
  clubFormat?: string;
};

export type Series = {
  id: string;
  name: string;
  type: string;
  host: { slug: string; name: string };
  opponents: { slug: string; name: string; accepted: boolean }[];
  matches: number;
  stadiums: string[];
  dates: string[];
  /** Matches played on one day: 1, or 2 in a quadrilateral series. */
  perDay?: number;
  /** The squad each board has announced so far, by board slug. */
  squads?: Record<string, { key: string; name: string }[]>;
  /** The full schedule; the final has no teams or stadium yet. */
  fixtures: { no: number; final: boolean; teams: string[] | null; stadium: string | null; date: string | null }[];
  bet: number;
  format: string;
  /** Label such as "6 overs 6 wickets" (Club format only). */
  clubFormat: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  /** Who declined the invitation (status 'declined' only; null when it simply lapsed at the deadline). */
  declinedBy: { slug: string; name: string } | null;
  declinedAt: number | null;
  /** Set by the administrator after the series; `winner` is null for a drawn series. */
  result: { winner: { slug: string; name: string } | null; note: string | null; at: number | null } | null;
  deadlineAt: number;
  createdAt: number;
  acceptedAt: number | null;
  editable: boolean;
};

export type SeriesOverview = { limit: number; active: number; canAct: boolean; stadiums: string[]; allStadiums: Record<string, string[]>; /** The board's registered players (for the squad announcement). */ roster: { key: string; name: string }[]; completed: Series[]; announced: Series[]; invitations: Series[]; upcoming: Series[] };

export type CalendarMatch = {
  seriesId: string;
  series: string;
  type: string;
  no: number;
  of: number;
  final: boolean;
  teams: string[] | null;
  teamNames: string[] | null;
  /** Every board in the series (the host first). */
  boards: string[];
  stadium: string | null;
  /** YYYY-MM-DD; null for a final, whose date is announced later. */
  date: string | null;
  format: string;
  bet: number;
  /** Winner of the series once the administrator has recorded it. */
  winner: string | null;
};

export type CreditEntry = { kind: 'series' | 'adjustment'; at: number; delta: number; text: string; series: string | null; id: string | null; /** Already added to the IOCF sheet's available credits. */ entered: boolean };
/** `pending`: changes recorded here that the IOCF sheet does not include yet. A board's balance is its sheet credits plus this. */
export type CreditsInfo = { pending: number; entries: CreditEntry[] };
export type AdminCredits = {
  boards: { slug: string; name: string; pending: number }[];
  settlements: { seriesId: string; name: string; at: number | null; entered: boolean; moves: { board: string; boardName: string; delta: number }[] }[];
  recentAdjustments: { id: string; at: number; board: string; boardName: string; amount: number; reason: string; by: string | null; entered: boolean }[];
};

/** One player's line in a series' statistics (or, for the totals, over every uploaded series). */
export type StatLine = {
  name: string;
  board: string | null;
  boardName: string;
  matches: number;
  pom: number;
  batInn: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  thirties: number;
  fifties: number;
  hundreds: number;
  notOuts: number;
  bowlInn: number;
  wickets: number;
  runsConceded: number;
  maidens: number;
  ballsBowled: number;
  dots: number;
  threeW: number;
  fiveW: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  avg: number;
  sr: number;
  bowlAvg: number;
  economy: number;
  /** The highest score as the scorer wrote it ("71*"), or the number for totals. */
  hs: string | number | null;
  best: string | null;
  hsNotOut?: boolean;
  /** Totals only: in how many series he appears. */
  series?: number;
};
export type SeriesStatsSummary = { key: string; kind: 'site' | 'record'; name: string; title: string | null; players: number; uploadedAt: number };
export type SeriesStatsDetail = { key: string; name: string; title: string | null; uploadedAt: number; players: StatLine[] };
export type TotalsResponse = { series: number; players: StatLine[] };

export const api = {
  me: () => request<{ user: CcUser }>('GET', '/me').then((r) => r.user),
  login: (role: Role, username: string, password: string) => request<{ user: CcUser }>('POST', '/login', { role, username, password }).then((r) => r.user),
  logout: () => request<{ ok: true }>('POST', '/logout'),
  dashboard: (slug: string) => request<DashboardInfo>('GET', `/boards/${encodeURIComponent(slug)}/dashboard`),
  overview: () => request<Overview>('GET', '/admin/overview'),
  accounts: () => request<AccountsInfo>('GET', '/admin/accounts'),
  setStatus: (accountId: string, status: 'active' | 'inactive') => request<{ ok: true }>('PATCH', `/admin/accounts/${encodeURIComponent(accountId)}`, { status }),
  setChairman: (accountId: string, chairmanName: string) => request<{ ok: true; chairmanName: string | null }>('PATCH', `/admin/accounts/${encodeURIComponent(accountId)}`, { chairmanName }),
  setBoardLogin: (slug: string, login: { username?: string; password?: string }) => request<{ ok: true; accountId: string; username: string; created: boolean }>('PUT', `/admin/boards/${encodeURIComponent(slug)}/account`, login),
  setModule: (slug: string, moduleId: string, enabled: boolean) => request<{ ok: true; modules: string[] }>('PUT', `/admin/boards/${encodeURIComponent(slug)}/modules`, { moduleId, enabled }),
  series: (slug: string) => request<SeriesOverview>('GET', `/boards/${encodeURIComponent(slug)}/series`),
  announceSeries: (slug: string, input: SeriesInput) => request<{ series: Series }>('POST', `/boards/${encodeURIComponent(slug)}/series`, input),
  editSeries: (slug: string, id: string, input: SeriesInput) => request<{ series: Series }>('PUT', `/boards/${encodeURIComponent(slug)}/series/${encodeURIComponent(id)}`, input),
  acceptSeries: (slug: string, id: string, squad: string[]) => request<{ series: Series }>('POST', `/boards/${encodeURIComponent(slug)}/series/${encodeURIComponent(id)}/accept`, { squad }),
  adminSeries: () => request<{ series: Series[] }>('GET', '/admin/series').then((r) => r.series),
  deleteSeries: (id: string) => request<{ ok: true }>('DELETE', `/admin/series/${encodeURIComponent(id)}`),
  fixtures: (slug: string) => request<{ today: string; matches: CalendarMatch[] }>('GET', `/boards/${encodeURIComponent(slug)}/fixtures`),
  setSeriesResult: (id: string, result: { winner: string; note?: string }) => request<{ series: Series }>('PUT', `/admin/series/${encodeURIComponent(id)}/result`, result),
  clearSeriesResult: (id: string) => request<{ series: Series }>('DELETE', `/admin/series/${encodeURIComponent(id)}/result`),
  credits: (slug: string) => request<CreditsInfo>('GET', `/boards/${encodeURIComponent(slug)}/credits`),
  adminCredits: () => request<AdminCredits>('GET', '/admin/credits'),
  adjustCredit: (adj: { board: string; amount: number; reason: string }) => request<{ id: string }>('POST', '/admin/credits/adjustments', adj),
  markEntered: (what: { seriesId?: string; adjustmentId?: string; all?: boolean; entered: boolean }) => request<{ updated: number }>('POST', '/admin/credits/entered', what),
  removeAdjustment: (id: string) => request<{ ok: true }>('DELETE', `/admin/credits/adjustments/${encodeURIComponent(id)}`),
  stadiums: (slug: string) => request<StadiumsInfo>('GET', `/boards/${encodeURIComponent(slug)}/stadiums`),
  requestStadium: (slug: string, input: { name: string; place: string }) => request<{ request: StadiumRequest }>('POST', `/boards/${encodeURIComponent(slug)}/stadiums`, input),
  withdrawStadium: (slug: string, id: string) => request<{ ok: true }>('DELETE', `/boards/${encodeURIComponent(slug)}/stadiums/${encodeURIComponent(id)}`),
  dismissStadium: (slug: string, id: string) => request<{ ok: true }>('POST', `/boards/${encodeURIComponent(slug)}/stadiums/${encodeURIComponent(id)}/dismiss`),
  mirrorNow: () => request<{ ok: true; tabs: number; rows: number; warnings: string[] }>('POST', '/admin/mirror'),
  pspMonths: (year?: number) => request<{ years: number[]; year: number; statuses: { id: string; label: string }[]; months: (PspMonth & { requests: number; credited: number })[] }>('GET', `/admin/psp/months${year ? `?year=${year}` : ''}`),
  pspAddYear: (year: number) => request<{ ok: true; year: number; added: number }>('POST', '/admin/psp/years', { year }),
  pspEnableMonth: (key: string) => request<{ month: PspMonth }>('POST', `/admin/psp/months/${encodeURIComponent(key)}/enable`),
  pspSetMonth: (key: string, body: { status?: string; deadlineAt?: number | null; note?: string }) => request<{ month: PspMonth }>('PUT', `/admin/psp/months/${encodeURIComponent(key)}`, body),
  pspCouncils: () => request<{ councils: { id: string; name: string; color: string; ranks: number; monthlyFunding: number; seats: { seat: number; board: string | null; boardName: string | null }[] }[]; boards: { slug: string; name: string; council: string | null; seat: number | null }[]; monthlyFunding: number; annualFunding: number }>('GET', '/admin/psp/councils'),
  pspSetSeat: (council: string, seat: number, board: string | null) => request<{ ok: true }>('PUT', `/admin/psp/councils/${council}/${seat}`, { board }),
  pspRankings: (month: string) => request<{ month: PspMonth; councils: { id: string; name: string; color: string; boards: { slug: string; name: string }[]; ranks: { rank: number; funding: number; board: string | null; boardName: string | null }[] }[]; assignedBoards: number; rankedBoards: number; missing: string[]; complete: boolean; totalFunding: number }>('GET', `/admin/psp/rankings/${encodeURIComponent(month)}`),
  pspSetRank: (month: string, council: string, rank: number, board: string | null, reason?: string) => request<{ ok: true; credits?: number }>('PUT', `/admin/psp/rankings/${encodeURIComponent(month)}/${council}/${rank}`, { board, reason }),
  pspPublish: (month: string) => request<{ month: PspMonth }>('POST', `/admin/psp/rankings/${encodeURIComponent(month)}/publish`),
  pspSettings: () => request<{ weights: Record<string, number> | null; percent: Record<string, number> | null; problem: string | null; complete: boolean; categories: { id: string; label: string; max: number | null }[]; councilFunding: { id: string; name: string; monthly: number }[]; monthlyFunding: number; annualFunding: number }>('GET', '/admin/psp/settings'),
  pspSaveSettings: (percent: Record<string, string | number>) => request<{ ok: true }>('PUT', '/admin/psp/settings', { percent }),
  pspRequests: (q: { month?: string; status?: string } = {}) => request<{ requests: PspRequest[] }>('GET', `/admin/psp/requests?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString()}`).then((r) => r.requests),
  pspRequest: (id: string) => request<{ request: PspRequestDetail }>('GET', `/admin/psp/requests/${encodeURIComponent(id)}`).then((r) => r.request),
  pspReview: (id: string) => request<{ ok: true }>('POST', `/admin/psp/requests/${encodeURIComponent(id)}/review`),
  pspApprove: (id: string) => request<{ request: PspRequest; already?: boolean }>('POST', `/admin/psp/requests/${encodeURIComponent(id)}/approve`),
  pspDecline: (id: string, reason: string) => request<{ request: PspRequest }>('POST', `/admin/psp/requests/${encodeURIComponent(id)}/decline`, { reason }),
  pspRecords: (q: { year?: string; month?: string; board?: string; q?: string } = {}) => request<{ records: PspRecord[]; total: number }>('GET', `/admin/psp/records?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString()}`),
  pspOverview: (year?: number, month?: string) => request<PspOverview>('GET', `/admin/psp/overview?${new URLSearchParams(Object.entries({ year: year ? String(year) : '', month: month ?? '' }).filter(([, v]) => v) as [string, string][]).toString()}`),
  pspBoard: (slug: string) => request<PspBoardList>('GET', `/boards/${encodeURIComponent(slug)}/psp`),
  pspBoardMonth: (slug: string, key: string) => request<PspBoardMonth>('GET', `/boards/${encodeURIComponent(slug)}/psp/months/${encodeURIComponent(key)}`),
  pspSaveDraft: (slug: string, key: string, lines: { category: string; key: string }[]) => request<{ request: PspRequest }>('PUT', `/boards/${encodeURIComponent(slug)}/psp/months/${encodeURIComponent(key)}/draft`, { lines }),
  pspSubmit: (slug: string, key: string, lines: { category: string; key: string }[]) => request<{ request: PspRequest }>('POST', `/boards/${encodeURIComponent(slug)}/psp/months/${encodeURIComponent(key)}/submit`, { lines }),
  pspBoardRecords: (slug: string) => request<{ board: string; boardName: string; topClassMonths: number; records: number; players: PspPlayerRecords[] }>('GET', `/boards/${encodeURIComponent(slug)}/psp/records`),
  adminStadiums: () => request<AdminStadiums>('GET', '/admin/stadiums'),
  acceptStadium: (id: string) => request<{ request: StadiumRequest }>('POST', `/admin/stadiums/${encodeURIComponent(id)}/accept`),
  declineStadium: (id: string, reason?: string) => request<{ request: StadiumRequest }>('POST', `/admin/stadiums/${encodeURIComponent(id)}/decline`, { reason }),
  declineSeries: (slug: string, id: string) => request<{ ok: true }>('POST', `/boards/${encodeURIComponent(slug)}/series/${encodeURIComponent(id)}/decline`),
  seriesMeta: () => request<{ meta: Record<string, string>; choices: string[] }>('GET', '/series-meta'),
  seriesStatsList: () => request<{ stats: SeriesStatsSummary[] }>('GET', '/series-stats').then((r) => r.stats),
  seriesStats: (key: string) => request<SeriesStatsDetail>('GET', `/series-stats/${encodeURIComponent(key)}`),
  uploadSeriesStats: (key: string, csv: string, name: string) => request<{ ok: true; players: number; warnings: string[] }>('PUT', `/admin/series-stats/${encodeURIComponent(key)}`, { csv, name }),
  removeSeriesStats: (key: string) => request<{ ok: true }>('DELETE', `/admin/series-stats/${encodeURIComponent(key)}`),
  setSeriesFormat: (key: string, format: string | null) => request<{ ok: true }>('PUT', `/admin/series-meta/${encodeURIComponent(key)}`, { format }),
  /** Statistics the administrator uploaded for Major Tournaments, by tournament id. No sign-in needed. */
  tournamentStatsLive: () => request<{ tournaments: Record<string, { title: string; tour: string; fields: string[]; rows: (string | number | null)[][]; uploadedAt: number }> }>('GET', '/public/tournament-stats'),
  /** How far each entry of a ranking moved in the last 10 days (and when the ranks were last worked out). No sign-in needed. */
  rankMoves: (ranking: string) => request<{ moves: Record<string, { by: number; isNew: boolean }>; updatedAt: number | null }>('GET', `/public/rank-moves/${encodeURIComponent(ranking)}`),
  /** Series announced on the site with a recorded result, and the formats given to earlier series. No sign-in needed. */
  seriesResults: () => request<{ series: { key: string; name: string; host: string; opponents: string[]; winner: string | null; drawn: boolean; format: string }[]; meta: Record<string, string> }>('GET', '/public/series-results'),
  /** The statistics of every uploaded series, line by line, with each series' format (null: use the sheet's). No sign-in needed. */
  seriesLines: () => request<{ series: { key: string; name: string; kind: 'site' | 'record'; format: string | null; fields: string[]; rows: (string | number | null)[][] }[] }>('GET', '/public/series-stats/lines'),
  /** The totals of every player over the uploaded series. No sign-in needed. */
  seriesTotals: () => request<TotalsResponse>('GET', '/public/series-stats'),
};
