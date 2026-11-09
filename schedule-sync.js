import { supabase } from "./supabase.js";

export const connectScheduleSync = async ({ onState, onConnectionStatus }) => {
    const readCurrentState = async () => {
        const { data, error } = await supabase
            .from("schedule_state")
            .select("schedule, week_number, announcement, updated_at")
            .eq("singleton", true)
            .maybeSingle();
        if (error) {
            throw error;
        }
        return data;
    };
    let initialReadComplete = false;
    let realtimeStateDuringInitialRead = null;
    let latestState = null;
    const isNewerState = (candidate, current) => {
        if (!candidate) {
            return false;
        }
        if (!current) {
            return true;
        }
        const candidateTime = Date.parse(candidate.updated_at);
        const currentTime = Date.parse(current.updated_at);
        return candidateTime > currentTime ||
            (candidateTime === currentTime && JSON.stringify(candidate) !== JSON.stringify(current));
    };

    const channel = supabase
        .channel("schedule-state-sync")
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "schedule_state" },
            (payload) => {
                const nextState = payload.eventType === "DELETE" ? null : payload.new;
                if (!initialReadComplete) {
                    realtimeStateDuringInitialRead = nextState;
                } else if (isNewerState(nextState, latestState)) {
                    latestState = nextState;
                    onState(nextState);
                }
            }
        );

    channel.subscribe((status, error) => {
        onConnectionStatus?.(status, error);
        if (status === "SUBSCRIBED" && initialReadComplete) {
            void readCurrentState().then((state) => {
                if (isNewerState(state, latestState)) {
                    latestState = state;
                    onState(state);
                }
            }).catch((readError) => onConnectionStatus?.("CHANNEL_ERROR", readError));
        }
    });

    let initialState;
    try {
        initialState = await readCurrentState();
    } catch (error) {
        await supabase.removeChannel(channel);
        throw error;
    }
    if (isNewerState(realtimeStateDuringInitialRead, initialState)) {
        initialState = realtimeStateDuringInitialRead;
    }
    latestState = initialState;
    initialReadComplete = true;

    return {
        initialState,
        async saveSchedule(schedule, weekNumber) {
            const { data: savedState, error: saveError } = await supabase.rpc("save_schedule", {
                p_schedule: schedule,
                p_week_number: weekNumber
            });
            if (saveError) {
                throw saveError;
            }
            return Array.isArray(savedState) ? savedState[0] : savedState;
        },
        async publishAnnouncement(message) {
            const { data: savedState, error: announcementError } = await supabase.rpc("publish_announcement", {
                p_message: message
            });
            if (announcementError) {
                throw announcementError;
            }
            return Array.isArray(savedState) ? savedState[0] : savedState;
        },
        async sendPushNotification(message) {
            const { data, error: pushError } = await supabase.functions.invoke("send-push-notification", {
                body: {
                    title: "Class-2 Schedule",
                    body: message,
                    url: new URL("./index.html", window.location.href).href
                }
            });
            if (pushError) {
                throw pushError;
            }
            return data;
        },
        async getCurrentState() {
            return readCurrentState();
        },
        async disconnect() {
            await supabase.removeChannel(channel);
        }
    };
};
