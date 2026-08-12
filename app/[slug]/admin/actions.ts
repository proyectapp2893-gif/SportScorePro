'use server';

import { clearClientSession, isMasterCredential, setClientSession, setMasterSession } from '@/app/lib/auth';
import { authenticateClientCredential } from '@/app/lib/client-auth';

export async function authorizeClientAccess(username: string, password: string, slug: string) {
  const safeUsername = username.toLowerCase().trim();

  if (isMasterCredential(safeUsername, password)) {
    await setMasterSession();
    return { success: true, isMaster: true };
  }

  const result = await authenticateClientCredential({ username: safeUsername, password, slug });
  if (!result.success) {
    return { success: false, error: 'Código incorrecto o institución no registrada.' };
  }

  const { client } = result;

  await setClientSession(slug, client.id);
  
  return { success: true, isMaster: false, client };
}

export async function logoutClientAccess(slug: string) {
  await clearClientSession(slug);
}
