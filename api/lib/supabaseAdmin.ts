import { createClient } from '@supabase/supabase-js';

// Remove BOM (0xFEFF) e espaços que podem aparecer em env vars copiadas no Windows
const clean = (s?: string) => (s ?? '').trim().replace(/^﻿/, '');

export const supabaseAdmin = createClient(
  clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL),
  clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
);
