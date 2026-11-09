self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data?.json() || {};
    } catch {
        payload = { body: event.data?.text() || "The schedule has changed." };
    }

    const notification = self.registration.showNotification(
        payload.title || "Class-2 Schedule",
        {
            body: payload.body || "The schedule has changed.",
            icon: new URL("./icon.svg", self.registration.scope).href,
            badge: new URL("./icon.svg", self.registration.scope).href,
            tag: "class-2-schedule-update",
            renotify: true,
            data: { url: payload.url || new URL("./index.html", self.registration.scope).href }
        }
    );
    event.waitUntil(notification);
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = new URL(
        event.notification.data?.url || "./index.html",
        self.registration.scope
    ).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of windows) {
            if (client.url.startsWith(self.registration.scope) && "focus" in client) {
                await client.navigate(targetUrl);
                return client.focus();
            }
        }
        return self.clients.openWindow(targetUrl);
    })());
});
