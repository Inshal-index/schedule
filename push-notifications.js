import { supabase } from "./supabase.js";

const vapidPublicKey = "BJdiZMDevP5pgcx9CsF3QVyXmrcoJDyxnwcmAePUAMJm-CkwP8r_G8fsub16AHGH4ttdRfIYZoWPddjZsopT6jY";
const toUint8Array = (base64Url) => {
    const padding = "=".repeat((4 - base64Url.length % 4) % 4);
    const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

const setStatus = (element, message) => {
    if (element) {
        element.textContent = message;
    }
};

export const setupPushNotifications = (button, status) => {
    if (!button) {
        return;
    }

    const isSupported = "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
    if (!isSupported) {
        button.hidden = true;
        return;
    }

    let subscription = null;
    const updateButton = () => {
        button.textContent = subscription ? "Turn off mobile notifications" : "Enable mobile notifications";
        button.setAttribute("aria-pressed", String(Boolean(subscription)));
    };

    const saveSubscription = async (nextSubscription) => {
        const { error } = await supabase.functions.invoke("register-push-subscription", {
            body: { subscription: nextSubscription.toJSON() }
        });
        if (error) {
            throw error;
        }
    };

    const removeSubscription = async (endpoint) => {
        const { error } = await supabase.functions.invoke("register-push-subscription", {
            body: { action: "remove", endpoint }
        });
        if (error) {
            throw error;
        }
    };

    void navigator.serviceWorker.register(new URL("./service-worker.js", window.location.href), {
        scope: new URL(".", window.location.href).pathname
    }).then(async (registration) => {
        subscription = await registration.pushManager.getSubscription();
        updateButton();
        setStatus(status, subscription
            ? "Notifications are enabled on this device."
            : "Notifications are off on this device.");
    }).catch((error) => {
        button.disabled = true;
        setStatus(status, `Could not prepare notifications: ${error.message}`);
    });

    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            if (subscription) {
                const endpoint = subscription.endpoint;
                await subscription.unsubscribe();
                await removeSubscription(endpoint);
                subscription = null;
                updateButton();
                setStatus(status, "Notifications are off on this device.");
            } else {
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    setStatus(status, "Notification permission was not granted.");
                    return;
                }
                const registration = await navigator.serviceWorker.ready;
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: toUint8Array(vapidPublicKey)
                });
                await saveSubscription(subscription);
                updateButton();
                setStatus(status, "Notifications are enabled on this device.");
            }
        } catch (error) {
            subscription = await navigator.serviceWorker.ready
                .then((registration) => registration.pushManager.getSubscription())
                .catch(() => null);
            updateButton();
            setStatus(status, `Could not update notifications: ${error.message}`);
        } finally {
            button.disabled = false;
        }
    });
};
