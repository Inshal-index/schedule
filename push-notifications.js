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

    if (!window.isSecureContext) {
        button.disabled = true;
        setStatus(status, "Mobile push notifications require an HTTPS page or localhost.");
        return;
    }

    let registration = null;
    let subscription = null;
    let subscriptionSaved = false;
    let isBusy = true;

    const updateButton = () => {
        button.textContent = subscription
            ? subscriptionSaved
                ? "Turn off mobile notifications"
                : "Finish enabling mobile notifications"
            : "Enable mobile notifications";
        button.setAttribute("aria-pressed", String(Boolean(subscription && subscriptionSaved)));
        button.disabled = isBusy || !registration;
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

    const showSubscriptionStatus = () => {
        if (subscription && subscriptionSaved) {
            setStatus(status, "Notifications are enabled on this device.");
        } else if (subscription) {
            setStatus(status, "This device is subscribed, but its registration could not be synced.");
        } else if (Notification.permission === "denied") {
            setStatus(status, "Notifications are blocked in this browser's settings.");
        } else {
            setStatus(status, "Notifications are off on this device.");
        }
    };

    void (async () => {
        try {
            registration = await navigator.serviceWorker.register(
                new URL("./service-worker.js", window.location.href),
                { scope: new URL(".", window.location.href).pathname }
            );
            subscription = await registration.pushManager.getSubscription();
            updateButton();

            if (subscription) {
                try {
                    await saveSubscription(subscription);
                    subscriptionSaved = true;
                } catch (error) {
                    console.error("Could not sync this device's push subscription:", error);
                }
            }
            isBusy = false;
            updateButton();
            showSubscriptionStatus();
        } catch (error) {
            isBusy = false;
            console.error("Could not prepare push notifications:", error);
            button.disabled = true;
            setStatus(status, `Could not prepare notifications: ${error.message}`);
        }
    })();

    button.addEventListener("click", async () => {
        if (!registration || isBusy) {
            return;
        }
        isBusy = true;
        updateButton();

        try {
            if (subscription && subscriptionSaved) {
                await removeSubscription(subscription.endpoint);
                await subscription.unsubscribe();
                subscription = null;
                subscriptionSaved = false;
                setStatus(status, "Notifications are off on this device.");
            } else if (subscription) {
                await saveSubscription(subscription);
                subscriptionSaved = true;
                setStatus(status, "Notifications are enabled on this device.");
            } else {
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    showSubscriptionStatus();
                    return;
                }
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: toUint8Array(vapidPublicKey)
                });
                await saveSubscription(subscription);
                subscriptionSaved = true;
                setStatus(status, "Notifications are enabled on this device.");
            }
        } catch (error) {
            console.error("Could not update push notifications:", error);
            subscription = await registration.pushManager.getSubscription().catch(() => null);
            subscriptionSaved = false;
            showSubscriptionStatus();
            setStatus(status, `Could not update notifications: ${error.message}`);
        } finally {
            isBusy = false;
            updateButton();
        }
    });

    updateButton();
    setStatus(status, "Preparing notifications...");
};
