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

export type DashboardInfo = { board: string; preview: boolean; chairmanName: string | null; modules: string[]; /** Series invitations waiting for this board. */ invitations: number };

export type Overview = {
  totalBoards: number;
  totalAccounts: number;
  activeBoardAccounts: number;
  inactiveBoardAccounts: number;
  boardsWithoutAccount: number;
  availableModules: number;
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
  /** The full schedule; the final has no teams or stadium yet. */
  fixtures: { no: number; final: boolean; teams: string[] | null; stadium: string | null; date: string | null }[];
  bet: number;
  format: string;
  /** Label such as "6 overs 6 wickets" (Club format only). */
  clubFormat: string | null;
  status: 'pending' | 'accepted' | 'declined';
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

export type SeriesOverview = { limit: number; active: number; canAct: boolean; stadiums: string[]; allStadiums: Record<string, string[]>; completed: Series[]; announced: Series[]; invitations: Series[]; upcoming: Series[] };

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
  acceptSeries: (slug: string, id: string) => request<{ series: Series }>('POST', `/boards/${encodeURIComponent(slug)}/series/${encodeURIComponent(id)}/accept`),
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
  declineSeries: (slug: string, id: string) => request<{ ok: true }>('POST', `/boards/${encodeURIComponent(slug)}/series/${encodeURIComponent(id)}/decline`),
};
