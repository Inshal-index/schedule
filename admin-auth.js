const authPage = document.getElementById("admin-auth");
const loginPanel = document.getElementById("admin-login");
const adminPanel = document.getElementById("admin-panel");
const loginForm = document.getElementById("admin-login-form");
const loginButton = loginForm.querySelector("button[type='submit']");
const loginError = document.getElementById("login-error");
let supabase;
let supabaseReady = false;
let editorLoaded = false;

const setLoginError = (message) => {
    loginError.textContent = message;
};

const describeError = (error) => {
    if (error?.message === "Invalid login credentials") {
        return "Incorrect email or password.";
    }
    return error?.message || "An unexpected error occurred.";
};

const showLogin = () => {
    authPage.hidden = false;
    loginPanel.hidden = false;
    adminPanel.hidden = true;
    loginButton.disabled = !supabaseReady;
    document.body.dataset.admin = "false";
    delete document.body.dataset.adminTeacher;
    delete document.body.dataset.adminRole;
};

const showAdmin = (profile) => {
    authPage.hidden = true;
    adminPanel.hidden = false;
    document.body.dataset.admin = "true";
    document.body.dataset.adminTeacher = profile.teacher || "";
    document.body.dataset.adminRole = profile.role;
    document.getElementById("admin-role-label").textContent = profile.teacher
        ? `${profile.teacher} — edit own classes only`
        : "Super admin — edit every class";
    document.getElementById("reset-schedule").hidden = profile.role !== "super";

    if (editorLoaded) {
        return;
    }
    editorLoaded = true;
    import(new URL("./schedule.js", window.location.href).href).catch((error) => {
        editorLoaded = false;
        document.getElementById("schedule-status").textContent =
            `Could not load the schedule editor: ${error.message}`;
    });
};

const signOutAfterError = async () => {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.error("Could not sign out after role lookup failed:", error.message);
        setLoginError(`${loginError.textContent} ${describeError(error)}`);
    }
};

const handleAuthenticatedUser = async (user) => {
    if (!user) {
        showLogin();
        return;
    }

    try {
        const { data: profile, error } = await supabase
            .from("admin_profiles")
            .select("role, teacher")
            .eq("user_id", user.id)
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!profile) {
            setLoginError(
                "This account has no admin role assigned. Ask the project owner to add its user ID to admin_profiles."
            );
            await signOutAfterError();
            return;
        }

        const isSuperAdmin = profile.role === "super";
        const isTeacher = profile.role === "teacher" &&
            typeof profile.teacher === "string" &&
            profile.teacher.trim() !== "";
        if (!isSuperAdmin && !isTeacher) {
            throw new Error("The Supabase admin profile has an invalid role.");
        }

        setLoginError("");
        loginForm.reset();
        showAdmin(profile);
    } catch (error) {
        console.error("Could not load admin role:", error.message);
        setLoginError(`Could not load this account's admin role: ${describeError(error)}`);
        await signOutAfterError();
    }
};

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginError("");
    if (!supabaseReady) {
        setLoginError("Supabase is still connecting. Wait a moment and try again.");
        return;
    }

    loginButton.disabled = true;
    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            throw error;
        }
    } catch (error) {
        setLoginError(`Could not sign in: ${describeError(error)}`);
        loginButton.disabled = false;
    }
});

document.getElementById("logout-admin").addEventListener("click", async () => {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            throw error;
        }
        loginForm.reset();
        setLoginError("");
    } catch (error) {
        document.getElementById("schedule-status").textContent =
            `Could not log out of Supabase: ${describeError(error)}`;
    }
});

import("./supabase.js").then((supabaseModule) => {
    supabase = supabaseModule.supabase;
    supabaseReady = true;
    loginButton.disabled = false;
    supabase.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => {
            void handleAuthenticatedUser(session?.user || null);
        }, 0);
    });
}).catch((error) => {
    setLoginError(`Could not connect to Supabase Authentication: ${describeError(error)}`);
});
