'use server'

import { cookies } from 'next/headers';

export async function verifyBunkerPassword(password: string) {
  // Compara la contraseña enviada con la variable de entorno secreta
  if (password === process.env.ADMIN_PASSWORD) {
    // Guardamos las cookies usando await (Requisito de Next.js reciente)
    const cookieStore = await cookies();
    
    cookieStore.set('csjb_bunker_key', 'acceso_concedido', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // Dura 1 semana
      path: '/',
    });
    return true;
  }
  
  return false;
}