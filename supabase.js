import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://edvozrqkfvmeqczekuvc.supabase.co";
const supabasePublishableKey = "sb_publishable_jU1sWeeU4dc_1KjBp07hBg_-cVpFJX2";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);