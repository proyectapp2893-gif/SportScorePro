import 'server-only';

import { cookies } from 'next/headers';
import { createPrivilegedSupabaseClient } from '@/app/lib/supabase/server';

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const MASTER_COOKIE = 'sportscore_master_auth';
const MASTER_COOKIE_VALUE = 'acceso_total';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

function normalizeUsername(username: string) {
  return username.toLowerCase().trim();
}

function authCookieName(slug: string) {
  return `auth_${slug}`;
}

function delegateCookieName(slug: string) {
  return `delegate_${slug}`;
}

function scorekeeperCookieName(slug: string) {
  return `scorekeeper_${slug}`;
}

export function isMasterCredential(username: string, password: string) {
  const masterUser = process.env.MASTER_BUNKER_USER?.toLowerCase().trim();
  const masterPassword = process.env.MASTER_BUNKER_PASSWORD ?? process.env.MASTER_BUNKER_KEY;

  if (!masterUser || !masterPassword) return false;

  return normalizeUsername(username) === masterUser && password.trim() === masterPassword;
}

export async function setMasterSession() {
  const cookieStore = await cookies();
  cookieStore.set(MASTER_COOKIE, MASTER_COOKIE_VALUE, cookieOptions());
}

export async function clearMasterSession() {
  const cookieStore = await cookies();
  cookieStore.delete(MASTER_COOKIE);
}

export async function hasMasterSession() {
  const cookieStore = await cookies();
  return cookieStore.get(MASTER_COOKIE)?.value === MASTER_COOKIE_VALUE;
}

export async function setClientSession(slug: string, clientId: string) {
  const cookieStore = await cookies();
  cookieStore.set(authCookieName(slug), clientId, cookieOptions());
}

export async function clearClientSession(slug: string) {
  const cookieStore = await cookies();
  cookieStore.delete(authCookieName(slug));
}

export async function getClientSession(slug: string) {
  const cookieStore = await cookies();
  return cookieStore.get(authCookieName(slug))?.value ?? null;
}

export async function hasAdminSession(slug: string) {
  if (await hasMasterSession()) return true;

  const clientId = await getClientSession(slug);
  if (!clientId) return false;

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  return Boolean(data && !error);
}

export async function setDelegateSession(slug: string, delegateId: string) {
  const cookieStore = await cookies();
  cookieStore.set(delegateCookieName(slug), delegateId, cookieOptions());
}

export async function clearDelegateSession(slug: string) {
  const cookieStore = await cookies();
  cookieStore.delete(delegateCookieName(slug));
}

export async function getDelegateSession(slug: string) {
  const cookieStore = await cookies();
  return cookieStore.get(delegateCookieName(slug))?.value ?? null;
}

export async function hasDelegateSession(slug: string) {
  const delegateId = await getDelegateSession(slug);
  if (!delegateId) return false;

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase
    .from('delegate_users')
    .select('id, clients!inner(slug, is_active)')
    .eq('id', delegateId)
    .eq('is_active', true)
    .eq('clients.slug', slug)
    .eq('clients.is_active', true)
    .maybeSingle();

  return Boolean(data && !error);
}

export async function setScorekeeperSession(slug: string, scorekeeperId: string) {
  const cookieStore = await cookies();
  cookieStore.set(scorekeeperCookieName(slug), scorekeeperId, cookieOptions());
}

export async function clearScorekeeperSession(slug: string) {
  const cookieStore = await cookies();
  cookieStore.delete(scorekeeperCookieName(slug));
}

export async function getScorekeeperSession(slug: string) {
  const cookieStore = await cookies();
  return cookieStore.get(scorekeeperCookieName(slug))?.value ?? null;
}

export async function hasScorekeeperSession(slug: string) {
  const scorekeeperId = await getScorekeeperSession(slug);
  if (!scorekeeperId) return false;

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase
    .from('scorekeeper_users')
    .select('id, clients!inner(slug, is_active)')
    .eq('id', scorekeeperId)
    .eq('is_active', true)
    .eq('clients.slug', slug)
    .eq('clients.is_active', true)
    .maybeSingle();

  return Boolean(data && !error);
}
