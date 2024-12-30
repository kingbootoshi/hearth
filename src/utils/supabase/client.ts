import { createClient } from '@supabase/supabase-js';
import { LocalDb } from './localDb';
import { logger } from '../logger';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';

// If no SUPABASE_URL provided, we use the local JSON fallback
let supabase: any;

if (!SUPABASE_URL) {
  // Use our local DB
  logger.info('No Supabase URL provided, using local DB');
  supabase = new LocalDb('local.json');
} else {
  // Use Supabase
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export { supabase };