export const DEMO_SLUG = 'experiencia-7c9f3a';
export const DEMO_STORAGE_KEY = 'sportscore:product-demo:v3';

export function isDemoPathname(pathname: string) {
  return pathname === `/demo-7c9f3a-sportscore` || pathname.startsWith(`/${DEMO_SLUG}/`);
}
