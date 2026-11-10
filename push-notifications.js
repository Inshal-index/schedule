import { supabase } from "./supabase.js";

const toUint8Array = (base64Url) => {
    const padding = "=".repeat((4 - base64Url.length % 4) % 4);
    const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
    const key = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    if (key.length !== 65 || key[0] !== 4) {
        throw new Error("The server returned an invalid VAPID public key.");
    }
    return key;
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

    const getVapidPublicKey = async () => {
        const { data, error } = await supabase.functions.invoke("register-push-subscription", {
            body: { action: "get-vapid-public-key" }
        });
        if (error) {
            throw error;
        }
        if (typeof data?.vapidPublicKey !== "string" || !data.vapidPublicKey) {
            throw new Error("The push service did not provide its VAPID public key.");
        }
        return toUint8Array(data.vapidPublicKey);
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
        let operation = "update notification settings";

        try {
            if (subscription && subscriptionSaved) {
                operation = "remove the device registration";
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
                operation = "load the server's VAPID key";
                const applicationServerKey = await getVapidPublicKey();
                operation = "create the browser push subscription";
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey
                });
                operation = "save the device registration";
                await saveSubscription(subscription);
                subscriptionSaved = true;
                setStatus(status, "Notifications are enabled on this device.");
            }
        } catch (error) {
            console.error(`Could not ${operation}:`, error);
            subscription = await registration.pushManager.getSubscription().catch(() => null);
            subscriptionSaved = false;
            showSubscriptionStatus();
            if (operation === "create the browser push subscription") {
                setStatus(
                    status,
                    "The browser's push service rejected the subscription. Check that the VAPID public/private keys in Supabase are a matching pair, then retry with a supported browser and a working network."
                );
            } else {
                setStatus(status, `Could not ${operation}: ${error.message}`);
            }
        } finally {
            isBusy = false;
            updateButton();
        }
    });

    updateButton();
    setStatus(status, "Preparing notifications...");
};
