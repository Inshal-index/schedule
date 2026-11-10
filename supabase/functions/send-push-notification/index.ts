import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "npm:web-push@3.6.7";

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
        const authorization = request.headers.get("Authorization") || "";
        const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!token) {
            return Response.json({ error: "Admin sign-in is required." }, { status: 401, headers });
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
        const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
        const vapidSubject = Deno.env.get("VAPID_SUBJECT");

        if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
            throw new Error("Push notification secrets are not configured.");
        }

        const authClient = createClient(supabaseUrl, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        const { data: userData, error: authError } = await authClient.auth.getUser(token);
        if (authError || !userData.user) {
            return Response.json({ error: "Admin sign-in is required." }, { status: 401, headers });
        }

        const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        const { data: profile, error: profileError } = await serviceClient
            .from("admin_profiles")
            .select("user_id")
            .eq("user_id", userData.user.id)
            .maybeSingle();

        if (profileError) {
            throw profileError;
        }

        if (!profile) {
            return Response.json({ error: "An admin profile is required." }, { status: 403, headers });
        }

        const body = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return Response.json({ error: "A notification request is required." }, { status: 400, headers });
        }
        const message = typeof body.body === "string"
            ? body.body.trim().slice(0, 300) || "The schedule has changed."
            : "The schedule has changed.";
        const title = typeof body.title === "string"
            ? body.title.trim().slice(0, 80) || "Class-2 Schedule"
            : "Class-2 Schedule";
        let requestedUrl: URL | null = null;
        if (typeof body.url === "string") {
            try {
                requestedUrl = new URL(body.url);
            } catch {
                requestedUrl = null;
            }
        }
        const safeUrl = requestedUrl?.origin === "https://inshal-index.github.io" &&
            requestedUrl.pathname.startsWith("/schedule/")
            ? requestedUrl.href
            : "https://inshal-index.github.io/schedule/index.html";

        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

        const { data: subscriptions, error: subscriptionsError } = await serviceClient
            .from("push_subscriptions")
            .select("endpoint, p256dh, auth");

        if (subscriptionsError) {
            throw subscriptionsError;
        }

        const payload = JSON.stringify({ title, body: message, url: safeUrl });
        const results = await Promise.allSettled((subscriptions || []).map((subscription) =>
            webpush.sendNotification({
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth }
            }, payload)
        ));

        const expiredEndpoints = (subscriptions || [])
            .filter((_subscription, index) => {
                const result = results[index];
                return result.status === "rejected" && [404, 410].includes(result.reason?.statusCode);
            })
            .map((subscription) => subscription.endpoint);

        if (expiredEndpoints.length) {
            const { error: deleteError } = await serviceClient
                .from("push_subscriptions")
                .delete()
                .in("endpoint", expiredEndpoints);

            if (deleteError) {
                console.error("Could not remove expired push subscriptions:", deleteError);
            }
        }

        const delivered = results.filter((result) => result.status === "fulfilled").length;
        const failedStatuses = results
            .filter((result) => result.status === "rejected")
            .map((result) => result.reason?.statusCode ?? result.reason?.name ?? "unknown");
        if (failedStatuses.length) {
            console.warn("Push delivery failed for some devices:", failedStatuses);
        }
        return Response.json({
            ok: true,
            attempted: results.length,
            delivered,
            failed: results.length - delivered
        }, { headers });
    } catch (error) {
        console.error("Push notification send failed:", error);
        return Response.json({ error: "Could not send schedule notifications." }, { status: 500, headers });
    }
});
