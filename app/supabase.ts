import { createClient } from '@supabase/supabase-js';
import { demoSupabase } from './lib/demo/database';
import { isDemoPathname } from './lib/demo/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const productionSupabase = createClient(supabaseUrl, supabaseKey);

export const supabase = new Proxy(productionSupabase, {
  get(target, property, receiver) {
    const activeClient = typeof window !== 'undefined' && isDemoPathname(window.location.pathname) ? demoSupabase : target;
    const value = Reflect.get(activeClient as object, property, receiver);
    return typeof value === 'function' ? value.bind(activeClient) : value;
  },
}) as typeof productionSupabase;
