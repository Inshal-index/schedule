import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
    "https://inshal-index.github.io",
    "http://127.0.0.1:8765",
    "http://localhost:8765",
    "https://edvozrqkfvmeqczekuvc.supabase.co"
]);

const corsHeaders = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
};

Deno.serve(async (request) => {
    const origin = request.headers.get("Origin") || "";
    const headers = {
        ...corsHeaders,
        ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {})
    };

    if (request.method === "OPTIONS") {
        return new Response("ok", { headers });
    }

    if (origin && !allowedOrigins.has(origin)) {
        return Response.json({ error: "Origin is not allowed." }, { status: 403, headers });
    }

    if (request.method !== "POST") {
        return Response.json({ error: "Method not allowed." }, { status: 405, headers });
    }

    try {
        const body = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return Response.json({ error: "A subscription request is required." }, { status: 400, headers });
        }

        if (body.action === "remove") {
            const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
            if (!endpoint) {
                return Response.json({ error: "Missing endpoint." }, { status: 400, headers });
            }
            let parsedEndpoint: URL;
            try {
                parsedEndpoint = new URL(endpoint);
            } catch {
                return Response.json({ error: "A valid HTTPS push endpoint is required." }, { status: 400, headers });
            }
            if (parsedEndpoint.protocol !== "https:" || parsedEndpoint.username || parsedEndpoint.password) {
                return Response.json({ error: "A valid HTTPS push endpoint is required." }, { status: 400, headers });
            }

            const supabaseUrl = Deno.env.get("SUPABASE_URL");
            const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
            if (!supabaseUrl || !serviceRoleKey) {
                throw new Error("Push subscription storage is not configured.");
            }

            const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
                auth: { persistSession: false, autoRefreshToken: false }
            });

            const { error } = await serviceClient
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", endpoint);

            if (error) {
                throw error;
            }

            return Response.json({ ok: true }, { headers });
        }

        const subscription = body.subscription;
        const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint : "";
        const keys = subscription?.keys || {};
        let parsedEndpoint: URL;
        try {
            parsedEndpoint = new URL(endpoint);
        } catch {
            return Response.json({ error: "A valid HTTPS push endpoint is required." }, { status: 400, headers });
        }
        if (!endpoint || parsedEndpoint.protocol !== "https:" ||
            parsedEndpoint.username || parsedEndpoint.password) {
            return Response.json({ error: "A valid HTTPS push endpoint is required." }, { status: 400, headers });
        }

        if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
            return Response.json({ error: "Push subscription keys are invalid." }, { status: 400, headers });
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Push subscription storage is not configured.");
        }

        const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        const { error } = await serviceClient
            .from("push_subscriptions")
            .upsert({
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                updated_at: new Date().toISOString()
            }, { onConflict: "endpoint" });

        if (error) {
            throw error;
        }

        return Response.json({ ok: true }, { headers });
    } catch (error) {
        console.error("Push subscription request failed:", error);
        return Response.json({ error: "Could not update this device's notification subscription." }, { status: 500, headers });
    }
});
