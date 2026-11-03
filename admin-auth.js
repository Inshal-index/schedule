const authPage = document.getElementById("admin-auth");
const loginPanel = document.getElementById("admin-login");
const adminPanel = document.getElementById("admin-panel");
const loginForm = document.getElementById("admin-login-form");
const loginButton = loginForm.querySelector("button[type='submit']");
const loginError = document.getElementById("login-error");
let firebase;
let firebaseReady = false;
let editorLoaded = false;

const setLoginError = (message) => {
    loginError.textContent = message;
};

const describeError = (error) => {
    if (error?.code?.startsWith("auth/api-key-not-valid")) {
        return "Firebase rejected the API key. Check the web app configuration in firebase.js.";
    }
    if (["auth/invalid-credential", "auth/wrong-password"].includes(error?.code)) {
        return "Incorrect email or password.";
    }
    if (error?.code === "auth/user-not-found") {
        return "No Firebase Authentication account exists for this email.";
    }
    return error?.message || "An unexpected error occurred.";
};

const showLogin = () => {
    authPage.hidden = false;
    loginPanel.hidden = false;
    adminPanel.hidden = true;
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
        await firebase.signOut(firebase.auth);
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
        const profileSnapshot = await firebase.getDoc(
            firebase.doc(firebase.db, "admins", user.uid)
        );
        if (!profileSnapshot.exists()) {
            setLoginError(
                "This account has no admin role assigned. Ask the project owner to add its UID to the admins collection."
            );
            await signOutAfterError();
            return;
        }

        const profile = profileSnapshot.data();
        const isSuperAdmin = profile.role === "super";
        const isTeacher = profile.role === "teacher" &&
            typeof profile.teacher === "string" &&
            profile.teacher.trim() !== "";
        if (!isSuperAdmin && !isTeacher) {
            throw new Error("The Firebase admin profile has an invalid role.");
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
    if (!firebaseReady) {
        setLoginError("Firebase is still connecting. Wait a moment and try again.");
        return;
    }

    loginButton.disabled = true;
    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    try {
        await firebase.signInWithEmailAndPassword(firebase.auth, email, password);
    } catch (error) {
        setLoginError(`Could not sign in: ${describeError(error)}`);
        loginButton.disabled = false;
    }
});

document.getElementById("logout-admin").addEventListener("click", async () => {
    try {
        await firebase.signOut(firebase.auth);
        loginForm.reset();
        setLoginError("");
    } catch (error) {
        document.getElementById("schedule-status").textContent =
            `Could not log out of Firebase: ${describeError(error)}`;
    }
});

import("./firebase.js").then((firebaseModule) => {
    firebase = firebaseModule;
    if (!firebase.auth || !firebase.signInWithEmailAndPassword || !firebase.onAuthStateChanged) {
        throw new Error("Firebase Authentication did not initialize correctly.");
    }
    firebaseReady = true;
    loginButton.disabled = false;
    firebase.onAuthStateChanged(firebase.auth, handleAuthenticatedUser);
}).catch((error) => {
    setLoginError(`Could not connect to Firebase Authentication: ${describeError(error)}`);
});
