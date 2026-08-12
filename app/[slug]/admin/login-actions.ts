'use server';

import { isMasterCredential, setClientSession, setMasterSession } from '@/app/lib/auth';
import { authenticateClientCredential } from '@/app/lib/client-auth';

type LoginCentralResult =
  | { success: true; isMaster: true }
  | { success: true; isMaster: false; name: string; slug: string }
  | { success: false; error: string };

export async function loginCentralUser(username: string, password: string): Promise<LoginCentralResult> {
  const safeUsername = username.toLowerCase().trim();

  if (isMasterCredential(safeUsername, password)) {
    await setMasterSession();
    return { success: true, isMaster: true };
  }

  const result = await authenticateClientCredential({ username: safeUsername, password });
  if (!result.success) return { success: false, error: result.error };

  const { client } = result;
  await setClientSession(client.slug, client.id);

  return { success: true, isMaster: false, name: client.name, slug: client.slug };
}
