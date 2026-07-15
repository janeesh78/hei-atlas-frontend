/**
 * Admin dashboard API client. Every call requires a Bearer token AND
 * an admin-listed email on the backend — non-admins see 403.
 */
import { apiFetch } from './apiBase';

const TOKEN_KEY = 'oncology.authToken';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function get<T>(path: string): Promise<T> {
  const t = getToken();
  const headers: Record<string, string> = {};
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await apiFetch(path, { headers });
  const text = await res.text();
  let data: { detail?: unknown } = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON error body (proxy 502/504) — don't throw a raw SyntaxError.
      throw new Error(res.ok ? 'Unexpected non-JSON response.' : `HTTP ${res.status}`);
    }
  }
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`);
  return data as T;
}

export interface AdminOverview {
  total_users: number;
  encounters_today: number;
  feedback_last_7d: { up: number; down: number };
  active_users_7d: number;
  as_of: string;
}

export interface AdminUserRow {
  id: string;
  name: string;
  credentials: string;
  npi: string;
  email: string;
  phone: string | null;
  npi_verified: boolean;
  created_at: string | null;
  last_login: string | null;
  encounters_today: number;
  active_minutes_today: number;
  location: null | {
    latitude: number;
    longitude: number;
    source: string;
    recorded_at: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
  };
  feedback: { up: number; down: number };
}

export interface AdminFeedbackRow {
  id: string;
  user_name: string;
  user_email: string;
  user_credentials: string;
  rating: 'up' | 'down';
  output_format: string | null;
  feedback_text: string | null;
  encounter_id: string | null;
  created_at: string | null;
}

export interface AdminActivity {
  window_days: number;
  per_day: { date: string; minutes: number; active_users: number }[];
  per_user: { user_id: string; name: string; email: string; minutes: number; active_days: number; notes: number }[];
  median_notes_per_active_user: number;
}

export interface AdminEncounters {
  window_days: number;
  per_day: { date: string; count: number }[];
  per_format: { format: string; count: number; pct: number }[];
  total: number;
}

export const getOverview   = () => get<AdminOverview>('/admin/overview');
export const getUsers      = () => get<AdminUserRow[]>('/admin/users');
export const getFeedback   = (limit = 100) => get<AdminFeedbackRow[]>(`/admin/feedback?limit=${limit}`);
export const getActivity   = (days = 14) => get<AdminActivity>(`/admin/activity?days=${days}`);
export const getEncounters = (days = 14) => get<AdminEncounters>(`/admin/encounters?days=${days}`);
