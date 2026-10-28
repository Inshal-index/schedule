(() => {
    const authKey = "class-2-admin-credentials";
    const sessionKey = "class-2-admin-role";
    const predefinedCredentials = {
        version: 1,
        accounts: {
            normal: {
                salt: "vCTldjBcE2EqajUlVx46TQ==",
                hash: "e2d7d4de8bea4046e5d3a2e7503d26801a42ea6bead0e53a040a223b8258033a"
            },
            super: {
                salt: "qF1jleYwYt8azPYlU2uhDA==",
                hash: "d953f116716f4d6d09474e00a4fd9b189858c02ec61140dd71fdb8c5cfda1a1a"
            }
        }
    };
    const authPage = document.getElementById("admin-auth");
    const loginPanel = document.getElementById("admin-login");
    const adminPanel = document.getElementById("admin-panel");
    const passwordManager = document.getElementById("password-manager");
    const iterations = 150000;

    if (!authPage || !loginPanel || !adminPanel || !passwordManager) {
        return;
    }

    const setError = (elementId, message) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
        }
    };

    const readCredentials = () => {
        const rawCredentials = localStorage.getItem(authKey);
        if (rawCredentials === null) {
            return predefinedCredentials;
        }

        const credentials = JSON.parse(rawCredentials);
        if (
            credentials?.version !== 1 ||
            !["normal", "super"].every((role) =>
                typeof credentials.accounts?.[role]?.salt === "string" &&
                typeof credentials.accounts[role].hash === "string"
            )
        ) {
            throw new Error("Saved password data is invalid. Clear this browser's saved admin credentials to restore the predefined passwords.");
        }
        return credentials;
    };

    const hashPassword = async (password, salt) => {
        if (!window.crypto?.subtle) {
            throw new Error("Password hashing is unavailable in this browser. Open the site over HTTPS or localhost.");
        }
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );
        const bits = await crypto.subtle.deriveBits({
            name: "PBKDF2",
            salt: Uint8Array.from(atob(salt), (character) => character.charCodeAt(0)),
            iterations,
            hash: "SHA-256"
        }, key, 256);
        return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
    };

    const createCredential = async (password) => {
        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
        const salt = btoa(String.fromCharCode(...saltBytes));
        return {
            salt,
            hash: await hashPassword(password, salt)
        };
    };

    const passwordsMatch = (left, right) => {
        if (left.length !== right.length) {
            return false;
        }
        let difference = 0;
        for (let index = 0; index < left.length; index += 1) {
            difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
        }
        return difference === 0;
    };

    const showLogin = () => {
        authPage.hidden = false;
        loginPanel.hidden = false;
        adminPanel.hidden = true;
        document.querySelector("#admin-login-form input[name='password']").focus();
    };

    const loadScheduleEditor = (role) => {
        authPage.hidden = true;
        adminPanel.hidden = false;
        document.getElementById("admin-role-label").textContent =
            role === "super" ? "Super admin" : "Normal admin";
        passwordManager.hidden = role !== "super";

        const script = document.createElement("script");
        script.src = "schedule.js";
        script.onerror = () => {
            document.getElementById("schedule-status").textContent =
                "Could not load the schedule editor. Refresh the page to try again.";
        };
        document.body.append(script);
    };

    const initialize = () => {
        authPage.hidden = false;
        try {
            const existingSession = sessionStorage.getItem(sessionKey);
            if (existingSession === "normal" || existingSession === "super") {
                readCredentials();
                loadScheduleEditor(existingSession);
                return;
            }

            showLogin();
        } catch (error) {
            showLogin();
            setError("login-error", error.message);
        }
    };

    document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        setError("login-error", "");
        const form = event.currentTarget;
        const formData = new FormData(form);
        const role = String(formData.get("role"));
        const password = String(formData.get("password") || "");
        const button = form.querySelector("button[type='submit']");
        button.disabled = true;
        try {
            const credentials = readCredentials();
            if (!credentials || (role !== "normal" && role !== "super")) {
                throw new Error("Admin passwords have not been set up in this browser.");
            }
            const enteredHash = await hashPassword(password, credentials.accounts[role].salt);
            if (!passwordsMatch(enteredHash, credentials.accounts[role].hash)) {
                setError("login-error", "Incorrect account or password.");
                return;
            }
            sessionStorage.setItem(sessionKey, role);
            form.reset();
            loadScheduleEditor(role);
        } catch (error) {
            setError("login-error", `Could not log in: ${error.message}`);
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById("password-manager-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        setError("password-manager-status", "");
        const form = event.currentTarget;
        const formData = new FormData(form);
        const currentSuperPassword = String(formData.get("currentSuperPassword") || "");
        const normalPassword = String(formData.get("normalPassword") || "");
        const superPassword = String(formData.get("superPassword") || "");
        const superPasswordConfirm = String(formData.get("superPasswordConfirm") || "");
        const button = form.querySelector("button[type='submit']");
        button.disabled = true;

        try {
            if (sessionStorage.getItem(sessionKey) !== "super") {
                throw new Error("Only a super admin can update admin passwords.");
            }
            if (!normalPassword || !superPassword) {
                throw new Error("Both new passwords are required.");
            }
            if (normalPassword === superPassword) {
                throw new Error("Choose different passwords for normal admin and super admin.");
            }
            if (superPassword !== superPasswordConfirm) {
                throw new Error("The new super admin passwords do not match.");
            }
            const credentials = readCredentials();
            const currentHash = await hashPassword(
                currentSuperPassword,
                credentials.accounts.super.salt
            );
            if (!passwordsMatch(currentHash, credentials.accounts.super.hash)) {
                throw new Error("Current super admin password is incorrect.");
            }
            credentials.accounts.normal = await createCredential(normalPassword);
            credentials.accounts.super = await createCredential(superPassword);
            localStorage.setItem(authKey, JSON.stringify(credentials));
            form.reset();
            setError("password-manager-status", "Admin passwords updated in this browser.");
        } catch (error) {
            setError("password-manager-status", error.message);
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById("logout-admin").addEventListener("click", () => {
        sessionStorage.removeItem(sessionKey);
        window.location.reload();
    });

    initialize();
})();
