import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';

// Use service role key for admin-level access to Supabase
// This key should be kept secure and only used server-side
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';

// Initialize Supabase client with service role key for full database access
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});