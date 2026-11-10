(async () => {
    const scheduleStorageKey = "class2-schedule";
    const weekNumberStorageKey = "class2-schedule-week-number";
    const announcementStorageKey = "class2-schedule-announcement";
    const defaultAnnouncement = "Schedule updates: Schedule changes and news will be posted here.";
    const times = [
        "8:50 AM-10:20 AM",
        "10:30 AM-12:00 PM",
        "2:00 PM-3:30 PM",
        "3:50 PM-5:20 PM",
        "7:00 PM-8:30 PM"
    ];
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const event = (course, teacher, weeks, location) => ({
        course,
        teacher,
        weeks,
        location
    });
    const defaultSchedule = [
        [
            [event("Static Web Design", "LI ZHENXINANG", "Week 8-13, 16-17", "Room 1402")],
            [event("Basic Chinese", "ZHANG YAN", "Week 8-19", "Room J5430")],
            [],
            [event("Basic Chinese", "ZHANG YAN", "Week 8-19", "Room J5430")],
            [event("Basic Chinese", "ZHANG YAN", "Week 8-19", "Room J5430")]
        ],
        [
            [event("Basic Chinese", "ZHANG YAN", "Week 8-19", "Room J5430")],
            [event("Information Technology", "WANG SEN", "Week 8-13", "Room 1505")],
            [event("Static Web Design", "LI ZHENXINANG", "Week 8-13, 16-17", "Room 1402")],
            [event("About China", "LU YOUXIA", "Week 8-15", "Room J5430")],
            [event("Cultural PE", "PENG TAO", "Week 8-10, 14-19", "Playground")]
        ],
        [
            [event("About China", "LU YOUXIA", "Week 8-15", "Room J5430")],
            [
                event("Introduction to AI", "HE DONG", "Week 8-15", "Room 1505")
            ],
            [event("Basic Chinese", "ZHANG YAN", "Week 8-19", "Room J5430")],
            [event("Aesthetic Education", "ZHANG YAN", "Week 9,14", "")],
            []
        ],
        [
            [event("Information Technology", "WANG SEN", "Week 8-13", "Room 1505")],
            [event("Static Web Design", "LI ZHENXINANG", "Week 8-13, 16-17", "Room 1402")],
            [],
            [
                event("1. Aesthetic Education", "ZHANG YAN", "Week 9,14", ""),
                event("2. Cultural PE", "PENG TAO", "Week 11-13", "Playground")
            ],
            []
        ],
        [
            [],
            [],
            [event("Information Technology", "WANG SEN", "Week 8-13", "Room 1505")],
            [],
            []
        ]
    ];

    const tableBody = document.querySelector(".schedule-table tbody");
    const status = document.getElementById("schedule-status");
    const chinaTimeDisplay = document.getElementById("china-time");
    const weekNumberInput = document.getElementById("week-number-editor");
    const isAdmin = document.body.dataset.admin === "true";
    const isSuperAdmin = document.body.dataset.adminRole === "super";
    const adminTeacher = document.body.dataset.adminTeacher?.trim().toUpperCase();
    let editorReady = false;
    if (!tableBody) {
        return;
    }

    const cloneDefault = () => JSON.parse(JSON.stringify(defaultSchedule));
    const isValidSchedule = (value) =>
        Array.isArray(value) &&
        value.length === times.length &&
        value.every((row) =>
            Array.isArray(row) &&
            row.length === days.length &&
            row.every((slot) =>
                Array.isArray(slot) &&
                slot.every((item) =>
                    item &&
                    typeof item.course === "string" &&
                    typeof item.teacher === "string" &&
                    typeof item.weeks === "string" &&
                    typeof item.location === "string"
                )
            )
        );
    const isValidWeekNumber = (value) =>
        Number.isInteger(value) && value >= 1 && value <= 53;
    let networkChinaTime = null;
    let chinaTimeSyncFailed = false;
    const getMinutes = (timeText) => {
        const match = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) {
            return null;
        }
        let hour = Number(match[1]) % 12;
        if (match[3].toUpperCase() === "PM") {
            hour += 12;
        }
        return hour * 60 + Number(match[2]);
    };
    const updateChinaClockAndHighlight = () => {
        if (!chinaTimeDisplay || !networkChinaTime) {
            return;
        }
        const currentTime = new Date(
            networkChinaTime.wallClockEpoch + performance.now() - networkChinaTime.syncedAt
        );
        const dayIndex = (currentTime.getUTCDay() + 6) % 7;
        const formatter = new Intl.DateTimeFormat(undefined, {
            timeZone: "UTC",
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit"
        });
        chinaTimeDisplay.textContent =
            `China Standard Time (UTC+8): ${formatter.format(currentTime)}` +
            (chinaTimeSyncFailed ? " (last network sync; refresh failed)" : "");

        const currentMinutes = currentTime.getUTCHours() * 60 + currentTime.getUTCMinutes();
        tableBody.querySelectorAll("td[data-row][data-day]").forEach((cell) => {
            const rowIndex = Number(cell.dataset.row);
            const cellDay = Number(cell.dataset.day);
            const range = times[rowIndex].split("-");
            const start = getMinutes(range[0]);
            const end = getMinutes(range[1]);
            const isCurrent = cellDay === dayIndex &&
                start !== null &&
                end !== null &&
                currentMinutes >= start &&
                currentMinutes < end &&
                schedule[rowIndex][cellDay].length > 0;
            cell.classList.toggle("is-current-lecture", isCurrent);
            cell.querySelectorAll(".schedule-event").forEach((lecture) => {
                lecture.classList.toggle("is-current-lecture", isCurrent);
            });
        });
    };
    const syncChinaTime = async () => {
        let timeout;
        try {
            const controller = new AbortController();
            timeout = window.setTimeout(() => controller.abort(), 10000);
            const response = await fetch(
                "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Shanghai",
                { cache: "no-store", signal: controller.signal }
            );
            if (!response.ok) {
                throw new Error(`Time service responded with HTTP ${response.status}.`);
            }
            const result = await response.json();
            const components = [
                result.year, result.month, result.day, result.hour,
                result.minute, result.seconds, result.milliSeconds
            ];
            if (!components.every(Number.isInteger) ||
                result.timeZone !== "Asia/Shanghai" ||
                result.month < 1 || result.month > 12 ||
                result.day < 1 || result.day > 31 ||
                result.hour < 0 || result.hour > 23 ||
                result.minute < 0 || result.minute > 59 ||
                result.seconds < 0 || result.seconds > 59 ||
                result.milliSeconds < 0 || result.milliSeconds > 999) {
                throw new Error("Time service returned an invalid China time.");
            }
            networkChinaTime = {
                wallClockEpoch: Date.UTC(
                    result.year,
                    result.month - 1,
                    result.day,
                    result.hour,
                    result.minute,
                    result.seconds,
                    result.milliSeconds
                ),
                syncedAt: performance.now()
            };
            chinaTimeSyncFailed = false;
            updateChinaClockAndHighlight();
        } catch (error) {
            chinaTimeSyncFailed = true;
            if (networkChinaTime) {
                updateChinaClockAndHighlight();
            } else if (chinaTimeDisplay) {
                chinaTimeDisplay.textContent =
                    `China time is unavailable; ongoing lectures cannot be determined. ${error.message}`;
            }
        } finally {
            window.clearTimeout(timeout);
        }
    };
    const updateWeekNumberDisplay = () => {
        document.querySelectorAll("[data-week-number]").forEach((element) => {
            element.textContent = String(weekNumber);
        });
        if (weekNumberInput && document.activeElement !== weekNumberInput) {
            weekNumberInput.value = String(weekNumber);
        }
    };
    const parseScheduleData = (value) => {
        const parsedSchedule = typeof value === "string" ? JSON.parse(value) : value;
        if (!isValidSchedule(parsedSchedule)) {
            throw new Error("The saved schedule has an invalid format.");
        }
        return parsedSchedule;
    };
    const setStatus = (message) => {
        if (status) {
            status.textContent = message;
        }
    };
    const canEditEvent = (item) =>
        isAdmin &&
        editorReady &&
        (isSuperAdmin || item.teacher.trim().toUpperCase() === adminTeacher);
    const getLectureTemplates = () => {
        const templates = [];
        const seen = new Set();
        [schedule, defaultSchedule].forEach((sourceSchedule) => {
            sourceSchedule.forEach((row) => {
                row.forEach((slot) => {
                    slot.forEach((item) => {
                        if (!isSuperAdmin &&
                            item.teacher.trim().toUpperCase() !== adminTeacher) {
                            return;
                        }
                        const key = JSON.stringify([item.course, item.teacher]);
                        if (!seen.has(key)) {
                            seen.add(key);
                            templates.push(item);
                        }
                    });
                });
            });
        });
        return templates;
    };

    const renderAnnouncement = (message) => {
        document.querySelectorAll(".event-bar").forEach((bar) => {
            const accessibleAnnouncement = bar.querySelector(".event-announcement");
            if (accessibleAnnouncement) {
                accessibleAnnouncement.textContent = message;
            }
            const track = bar.querySelector(".event-track");
            const groups = track?.querySelectorAll(".event-group");
            if (!track || !groups || groups.length < 2) {
                return;
            }
            const text = message.trim() || defaultAnnouncement;
            const fillGroup = (group) => {
                group.replaceChildren();
                do {
                    const tickerItem = document.createElement("span");
                    tickerItem.className = "event-message";
                    tickerItem.textContent = text;
                    group.append(tickerItem);
                } while (group.scrollWidth < bar.clientWidth + group.firstElementChild.offsetWidth);
            };
            fillGroup(groups[0]);
            fillGroup(groups[1]);
            const groupWidth = groups[0].getBoundingClientRect().width;
            track.style.setProperty("--ticker-distance", `${groupWidth}px`);
            track.style.setProperty("--ticker-duration", `${Math.max(12, groupWidth / 70)}s`);
        });
    };

    let schedule = cloneDefault();
    let announcement = defaultAnnouncement;
    let addingSlot = null;
    let nativeDragSource = null;
    let weekNumber = 9;
    let storageError = "";
    let scheduleSync = null;
    let syncReady = false;
    let hasPendingScheduleChanges = false;
    let pendingRemoteState = null;
    try {
        const savedSchedule = localStorage.getItem(scheduleStorageKey);
        if (savedSchedule !== null) {
            schedule = parseScheduleData(savedSchedule);
        }
        const savedWeekNumber = Number(localStorage.getItem(weekNumberStorageKey));
        if (isValidWeekNumber(savedWeekNumber)) {
            weekNumber = savedWeekNumber;
        }
        const savedAnnouncement = localStorage.getItem(announcementStorageKey);
        if (savedAnnouncement !== null) {
            announcement = savedAnnouncement;
        }
    } catch (error) {
        storageError = `Could not read saved schedule data: ${error.message}`;
    }
    updateWeekNumberDisplay();
    render();
    renderAnnouncement(announcement);
    updateChinaClockAndHighlight();
    void syncChinaTime();
    window.setInterval(updateChinaClockAndHighlight, 1000);
    window.setInterval(syncChinaTime, 5 * 60 * 1000);
    window.addEventListener("resize", () => renderAnnouncement(announcement));
    setStatus("Loading shared schedule from Supabase...");
    const notificationToggle = document.getElementById("notification-toggle");
    if (notificationToggle) {
        import("./push-notifications.js").then(({ setupPushNotifications }) => {
            setupPushNotifications(notificationToggle, document.getElementById("notification-status"));
        }).catch((error) => {
            const notificationStatus = document.getElementById("notification-status");
            if (notificationStatus) {
                notificationStatus.textContent = `Could not load notifications: ${error.message}`;
            }
        });
    }
    let selectedSource = null;
    let saveTimer;
    let pendingSaveResolve = null;
    let scheduleSaveInFlight = false;

    const cacheCurrentState = () => {
        try {
            localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
            localStorage.setItem(weekNumberStorageKey, String(weekNumber));
            localStorage.setItem(announcementStorageKey, announcement);
        } catch (error) {
            setStatus(`Shared data loaded, but this browser could not cache it: ${error.message}`);
        }
    };

    const applySharedState = (sharedState, message = "Schedule updated from another device.") => {
        if (!sharedState) {
            return;
        }
        const wasEditorReady = editorReady;
        try {
            const updatedSchedule = parseScheduleData(sharedState.schedule);
            if (!isValidWeekNumber(sharedState.week_number) ||
                typeof sharedState.announcement !== "string") {
                throw new Error("The Supabase schedule row has invalid fields.");
            }
            const hasVisibleChanges = JSON.stringify(updatedSchedule) !== JSON.stringify(schedule) ||
                sharedState.week_number !== weekNumber ||
                sharedState.announcement !== announcement;
            schedule = updatedSchedule;
            weekNumber = sharedState.week_number;
            announcement = sharedState.announcement;
            syncReady = true;
            editorReady = true;
            updateWeekNumberDisplay();
            if (weekNumberInput) {
                weekNumberInput.disabled = !isAdmin;
            }
            const resetButton = document.getElementById("reset-schedule");
            if (resetButton) {
                resetButton.disabled = !isSuperAdmin;
            }
            cacheCurrentState();
            if (hasVisibleChanges || !wasEditorReady) {
                render();
                renderAnnouncement(announcement);
                updateChinaClockAndHighlight();
                setStatus(message);
            }
        } catch (error) {
            setStatus(`Could not load the shared schedule: ${error.message}`);
        }
    };

    render();
    window.addEventListener("storage", (storageEvent) => {
        if (storageEvent.key === scheduleStorageKey && storageEvent.newValue) {
            try {
                const updatedSchedule = JSON.parse(storageEvent.newValue);
                if (!isValidSchedule(updatedSchedule)) {
                    throw new Error("The saved schedule has an invalid format.");
                }
                schedule = updatedSchedule;
                render();
                setStatus("Schedule updated from another tab.");
            } catch (error) {
                setStatus(`Could not load the schedule from another tab: ${error.message}`);
            }
        }
        if (storageEvent.key === announcementStorageKey && storageEvent.newValue !== null) {
            announcement = storageEvent.newValue;
            renderAnnouncement(announcement);
        }
    });

    const publishAnnouncement = async (message) => {
        announcement = message;
        renderAnnouncement(message);
        try {
            localStorage.setItem(announcementStorageKey, message);
        } catch (error) {
            setStatus(`The notification is shown here, but could not be cached: ${error.message}`);
        }
        if (!scheduleSync) {
            setStatus("The announcement is saved in this browser only. Supabase is unavailable.");
            return;
        }
        try {
            await scheduleSync.publishAnnouncement(message);
        } catch (error) {
            setStatus(`Announcement is shown locally but could not sync: ${error.message}`);
            return;
        }
        try {
            const result = await scheduleSync.sendPushNotification(message);
            const attempted = Number(result?.attempted);
            const delivered = Number(result?.delivered);
            const failed = Number(result?.failed ?? attempted - delivered);
            if (!Number.isInteger(attempted) || !Number.isInteger(delivered) ||
                !Number.isInteger(failed) || attempted < 0 || delivered < 0 || failed < 0) {
                throw new Error("The push service returned an invalid delivery summary.");
            }
            if (attempted === 0) {
                setStatus("Announcement synced; no devices have notifications enabled.");
            } else if (delivered === attempted) {
                setStatus(`Announcement synced; notifications sent to ${delivered} device(s).`);
            } else if (delivered > 0) {
                setStatus(`Announcement synced; notifications sent to ${delivered} of ${attempted} device(s), ${failed} could not be reached.`);
            } else {
                setStatus(`Announcement synced, but none of ${attempted} device(s) could be reached.`);
            }
        } catch (error) {
            setStatus(`Announcement synced to Supabase; mobile push is not available yet: ${error.message}`);
        }
    };

    try {
        const { connectScheduleSync } = await import("./schedule-sync.js");
        scheduleSync = await connectScheduleSync({
            onState: (sharedState) => {
                if (!sharedState) {
                    return;
                }
                if (hasPendingScheduleChanges || saveTimer || scheduleSaveInFlight) {
                    pendingRemoteState = sharedState;
                    return;
                }
                applySharedState(sharedState);
            },
            onConnectionStatus: (connectionStatus, error) => {
                if (connectionStatus === "CHANNEL_ERROR" || connectionStatus === "TIMED_OUT") {
                    setStatus(`Supabase realtime is unavailable; refreshing may be needed. ${error?.message || ""}`);
                }
            }
        });
        syncReady = true;
        if (scheduleSync.initialState) {
            setStatus("Connected to Supabase. Shared schedule is live.");
            applySharedState(scheduleSync.initialState, "Connected to Supabase. Shared schedule is live.");
        } else {
            editorReady = isSuperAdmin;
            if (weekNumberInput) {
                weekNumberInput.disabled = !isSuperAdmin;
            }
            const resetButton = document.getElementById("reset-schedule");
            if (resetButton) {
                resetButton.disabled = !isSuperAdmin;
            }
            setStatus("No shared schedule exists yet. A super admin can initialize it from the default timetable.");
        }
    } catch (error) {
        editorReady = !isAdmin;
        storageError = `Could not connect to Supabase. Changes will stay in this browser: ${error.message}`;
        setStatus(storageError);
    }

    if (weekNumberInput) {
        weekNumberInput.disabled = !isAdmin || !editorReady;
    }

    function renderField(item, field, label, parent, editable) {
        const element = document.createElement(field === "course" ? "strong" : "span");
        element.className = `schedule-${field}`;
        element.dataset.field = field;
        element.textContent = item[field];
        if (editable) {
            element.contentEditable = "true";
            element.setAttribute("role", "textbox");
            element.setAttribute("aria-label", label);
            element.spellcheck = false;
        }
        if (field === "teacher") {
            const name = item.teacher.trim().toUpperCase();
            if (["LI ZHENXINANG", "WANG SEN", "PENG TAO", "HE DONG"].includes(name)) {
                element.classList.add("teacher-name--boy");
            } else if (["ZHANG YAN", "LU YOUXIA"].includes(name)) {
                element.classList.add("teacher-name--girl");
            }
        }
        parent.append(element);
        return element;
    }

    function render() {
        tableBody.replaceChildren();
        schedule.forEach((row, rowIndex) => {
            const tableRow = document.createElement("tr");
            const timeCell = document.createElement("th");
            timeCell.scope = "row";
            timeCell.textContent = times[rowIndex];
            tableRow.append(timeCell);

            row.forEach((slot, dayIndex) => {
                const cell = document.createElement("td");
                cell.dataset.row = String(rowIndex);
                cell.dataset.day = String(dayIndex);
                if (isAdmin) {
                    cell.classList.add("admin-slot");
                }

                if (slot.length === 0 && isAdmin) {
                    if (!editorReady) {
                        const placeholder = document.createElement("span");
                        placeholder.className = "empty-slot-hint";
                        placeholder.textContent = "Loading schedule...";
                        cell.append(placeholder);
                    } else if (addingSlot?.row === rowIndex && addingSlot?.day === dayIndex) {
                        const form = document.createElement("form");
                        form.className = "add-lecture-form";

                        const lectureSelect = document.createElement("select");
                        lectureSelect.name = "lecture";
                        lectureSelect.setAttribute("aria-label", "Choose a lecture");
                        lectureSelect.required = true;
                        const chooseLecture = document.createElement("option");
                        chooseLecture.value = "";
                        chooseLecture.textContent = "Choose a lecture";
                        lectureSelect.append(chooseLecture);
                        getLectureTemplates().forEach((template, index) => {
                            const option = document.createElement("option");
                            option.value = String(index);
                            option.textContent = isSuperAdmin
                                ? `${template.course} — ${template.teacher}`
                                : template.course;
                            lectureSelect.append(option);
                        });
                        form.append(lectureSelect);

                        const actions = document.createElement("div");
                        actions.className = "add-lecture-actions";
                        const addButton = document.createElement("button");
                        addButton.type = "submit";
                        addButton.textContent = "Add";
                        const cancelButton = document.createElement("button");
                        cancelButton.type = "button";
                        cancelButton.className = "cancel-add-lecture";
                        cancelButton.textContent = "Cancel";
                        actions.append(addButton, cancelButton);
                        form.append(actions);
                        cell.append(form);
                    } else {
                        const addButton = document.createElement("button");
                        addButton.type = "button";
                        addButton.className = "add-lecture";
                        addButton.textContent = "+";
                        addButton.setAttribute(
                            "aria-label",
                            `Add lecture on ${days[dayIndex]} at ${times[rowIndex]}`
                        );
                        addButton.title = "Add lecture";
                        cell.append(addButton);
                    }
                }

                slot.forEach((item, eventIndex) => {
                    const card = document.createElement("div");
                    card.className = "schedule-event";
                    card.dataset.eventIndex = String(eventIndex);

                    if (canEditEvent(item)) {
                        const actions = document.createElement("div");
                        actions.className = "schedule-actions";

                        const moveHandle = document.createElement("button");
                        moveHandle.type = "button";
                        moveHandle.className = "drag-handle";
                        moveHandle.textContent = "Move";
                        moveHandle.setAttribute("aria-label", `Move ${item.course}`);
                        moveHandle.draggable = true;
                        actions.append(moveHandle);

                        const deleteButton = document.createElement("button");
                        deleteButton.type = "button";
                        deleteButton.className = "delete-lecture";
                        deleteButton.textContent = "Delete";
                        deleteButton.setAttribute("aria-label", `Delete ${item.course}`);
                        actions.append(deleteButton);
                        card.append(actions);
                    }

                    const canEdit = canEditEvent(item);
                    renderField(item, "course", "Class name", card, canEdit);
                    renderField(item, "teacher", "Teacher name", card, canEdit && isSuperAdmin);
                    renderField(item, "weeks", "Class weeks", card, canEdit);
                    if (item.location) {
                        renderField(item, "location", "Room or location", card, canEdit);
                    } else if (isAdmin) {
                        renderField(item, "location", "Room or location", card, canEdit);
                    } else {
                        const location = document.createElement("span");
                        location.className = "schedule-location";
                        location.hidden = true;
                        card.append(location);
                    }
                    card.dataset.eventIndex = String(eventIndex);
                    cell.append(card);
                });
                tableRow.append(cell);
            });
            tableBody.append(tableRow);
        });
        updateChinaClockAndHighlight();
    }

    const save = (debounce = false) => {
        setStatus(syncReady
            ? "Saving changes to the shared schedule..."
            : "Saving changes in this browser...");
        hasPendingScheduleChanges = true;
        window.clearTimeout(saveTimer);
        if (pendingSaveResolve) {
            pendingSaveResolve(false);
            pendingSaveResolve = null;
        }

        return new Promise((resolve) => {
            const persist = async () => {
                saveTimer = undefined;
                pendingSaveResolve = null;
                let succeeded = false;
                let completionMessage = "";

                if (!scheduleSync || !syncReady) {
                    try {
                        localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
                        localStorage.setItem(weekNumberStorageKey, String(weekNumber));
                        succeeded = true;
                        hasPendingScheduleChanges = false;
                        completionMessage = "Changes saved in this browser only. Supabase is unavailable.";
                    } catch (error) {
                        hasPendingScheduleChanges = false;
                        completionMessage = `Could not save changes in this browser: ${error.message}`;
                    }
                    setStatus(completionMessage);
                    resolve(succeeded);
                    return;
                }

                const savedSchedule = JSON.stringify(schedule);
                const savedWeekNumber = weekNumber;
                scheduleSaveInFlight = true;
                try {
                    await scheduleSync.saveSchedule(schedule, weekNumber);
                    succeeded = true;
                    if (JSON.stringify(schedule) === savedSchedule && weekNumber === savedWeekNumber) {
                        hasPendingScheduleChanges = false;
                    }
                    try {
                        localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
                        localStorage.setItem(weekNumberStorageKey, String(weekNumber));
                        completionMessage = "Changes saved to Supabase and synced to other devices.";
                    } catch (error) {
                        completionMessage = `Schedule synced, but could not be cached in this browser: ${error.message}`;
                    }
                } catch (error) {
                    hasPendingScheduleChanges = false;
                    completionMessage = `Could not save to Supabase: ${error.message}`;
                    let currentState = pendingRemoteState;
                    pendingRemoteState = null;
                    if (!currentState) {
                        try {
                            currentState = await scheduleSync.getCurrentState();
                        } catch (readError) {
                            completionMessage += ` Could not refresh the shared schedule: ${readError.message}`;
                        }
                    }
                    if (currentState) {
                        applySharedState(currentState, "Save rejected; showing the latest shared schedule.");
                    }
                } finally {
                    scheduleSaveInFlight = false;
                    if (pendingRemoteState && !hasPendingScheduleChanges && !saveTimer) {
                        const remoteState = pendingRemoteState;
                        pendingRemoteState = null;
                        applySharedState(remoteState);
                    }
                }

                setStatus(completionMessage);
                resolve(succeeded);
            };

            if (debounce) {
                pendingSaveResolve = resolve;
                saveTimer = window.setTimeout(() => void persist(), 350);
            } else {
                void persist();
            }
        });
    };

    const moveEvent = async (source, target) => {
        if (
            !Number.isInteger(source?.row) ||
            !Number.isInteger(source?.day) ||
            !Number.isInteger(source?.eventIndex) ||
            source.row < 0 ||
            source.row >= times.length ||
            source.day < 0 ||
            source.day >= days.length ||
            !Number.isInteger(target?.row) ||
            !Number.isInteger(target?.day) ||
            target.row < 0 ||
            target.row >= times.length ||
            target.day < 0 ||
            target.day >= days.length ||
            source.eventIndex < 0 ||
            source.eventIndex >= schedule[source.row][source.day].length
        ) {
            clearSelection();
            setStatus("Could not move class: the source or destination is no longer available.");
            return;
        }
        const sourceSlot = schedule[source.row][source.day];
        const targetSlot = schedule[target.row][target.day];
        if (!canEditEvent(sourceSlot[source.eventIndex])) {
            clearSelection();
            setStatus("You can only move classes assigned to your account.");
            return;
        }
        if (source.row === target.row && source.day === target.day) {
            selectedSource = null;
            render();
            return;
        }
        if (targetSlot.length > 0) {
            clearSelection();
            setStatus("That time slot already has a lecture. Move this class to an empty slot.");
            return;
        }
        const [movedEvent] = sourceSlot.splice(source.eventIndex, 1);
        targetSlot.push(movedEvent);
        selectedSource = null;
        render();
        if (await save()) {
            await publishAnnouncement(
                `${movedEvent.teacher || "A teacher"}: ${movedEvent.course || "A lecture"} moved from ${days[source.day]} at ${times[source.row]} to ${days[target.day]} at ${times[target.row]}.`
            );
        }
    };

    const clearSelection = () => {
        selectedSource = null;
        tableBody.querySelectorAll(".is-selected").forEach((card) => {
            card.classList.remove("is-selected");
        });
    };

    if (isAdmin) {
        let touchDrag = null;
        let suppressClick = false;

        weekNumberInput?.addEventListener("focus", () => {
            weekNumberInput.dataset.originalValue = String(weekNumber);
        });

        weekNumberInput?.addEventListener("input", () => {
            const nextWeekNumber = Number(weekNumberInput.value);
            if (!isValidWeekNumber(nextWeekNumber)) {
                return;
            }
            weekNumber = nextWeekNumber;
            try {
                localStorage.setItem(weekNumberStorageKey, String(weekNumber));
            } catch (error) {
                setStatus(`Week number changed but could not be cached in this browser: ${error.message}`);
            }
            updateWeekNumberDisplay();
            save(true);
        });

        weekNumberInput?.addEventListener("change", async () => {
            const nextWeekNumber = Number(weekNumberInput.value);
            if (!isValidWeekNumber(nextWeekNumber)) {
                weekNumberInput.value = String(weekNumber);
                setStatus("Week number must be between 1 and 53.");
            } else {
                const previousWeekNumber = Number(
                    weekNumberInput.dataset.originalValue ?? weekNumber
                );
                delete weekNumberInput.dataset.originalValue;
                if (await save() && previousWeekNumber !== nextWeekNumber) {
                    await publishAnnouncement(`The class schedule is now on Week ${nextWeekNumber}.`);
                }
            }
        });

        tableBody.addEventListener("submit", async (submitEvent) => {
            const form = submitEvent.target.closest(".add-lecture-form");
            if (!form) {
                return;
            }
            submitEvent.preventDefault();
            const row = addingSlot?.row;
            const day = addingSlot?.day;
            if (!Number.isInteger(row) || !Number.isInteger(day)) {
                setStatus("Could not add lecture: the selected schedule slot is no longer available.");
                addingSlot = null;
                render();
                return;
            }

            const formData = new FormData(form);
            const selectedTemplate = String(formData.get("lecture") || "");
            const templateIndex = selectedTemplate === "" ? -1 : Number(selectedTemplate);
            const templates = getLectureTemplates();
            const template = Number.isInteger(templateIndex)
                ? templates[templateIndex]
                : null;
            const slot = schedule[row][day];
            if (!template) {
                setStatus("Choose a lecture before adding it to the schedule.");
                return;
            }
            if (slot.length !== 0) {
                addingSlot = null;
                render();
                setStatus("Could not add lecture: that schedule slot is no longer empty.");
                return;
            }

            const lecture = event(
                template.course,
                isSuperAdmin ? template.teacher : adminTeacher,
                template.weeks,
                template.location
            );
            slot.push(lecture);
            addingSlot = null;
            render();
            if (await save()) {
                await publishAnnouncement(
                    `${lecture.teacher}: ${lecture.course} was added for ${days[day]} at ${times[row]}.`
                );
            }
        });

        tableBody.addEventListener("focusin", (focusEvent) => {
            const field = focusEvent.target.closest("[data-field]");
            const card = field?.closest(".schedule-event");
            const cell = card?.closest("td[data-row][data-day]");
            const item = cell && card
                ? schedule[Number(cell.dataset.row)][Number(cell.dataset.day)][Number(card.dataset.eventIndex)]
                : null;
            if (field && item && canEditEvent(item) &&
                (field.dataset.field !== "teacher" || isSuperAdmin)) {
                field.dataset.originalValue = field.textContent.trim();
            }
        });

        tableBody.addEventListener("input", (inputEvent) => {
            const field = inputEvent.target.closest("[data-field]");
            const card = field?.closest(".schedule-event");
            const cell = card?.closest("td[data-row][data-day]");
            if (!field || !card || !cell) {
                return;
            }
            const item = schedule[Number(cell.dataset.row)][Number(cell.dataset.day)][Number(card.dataset.eventIndex)];
            if (!canEditEvent(item) || (field.dataset.field === "teacher" && !isSuperAdmin)) {
                return;
            }
            item[field.dataset.field] = field.textContent.replace(/\s+/g, " ").trim();
            if (field.dataset.field === "teacher") {
                field.classList.remove("teacher-name--boy", "teacher-name--girl");
                const name = item.teacher.toUpperCase();
                if (["LI ZHENXINANG", "WANG SEN", "PENG TAO", "HE DONG"].includes(name)) {
                    field.classList.add("teacher-name--boy");
                } else if (["ZHANG YAN", "LU YOUXIA"].includes(name)) {
                    field.classList.add("teacher-name--girl");
                }
            }
            save(true);
        });

        tableBody.addEventListener("focusout", async (focusEvent) => {
            const field = focusEvent.target.closest("[data-field]");
            const card = field?.closest(".schedule-event");
            const cell = card?.closest("td[data-row][data-day]");
            if (!field || !card || !cell) {
                return;
            }
            const item = schedule[Number(cell.dataset.row)][Number(cell.dataset.day)][Number(card.dataset.eventIndex)];
            if (!canEditEvent(item) || (field.dataset.field === "teacher" && !isSuperAdmin)) {
                return;
            }
            const currentValue = field.textContent.replace(/\s+/g, " ").trim();
            const originalValue = field.dataset.originalValue ?? currentValue;
            delete field.dataset.originalValue;
            if (currentValue === originalValue) {
                return;
            }
            const fieldLabels = {
                course: "lecture name",
                teacher: "teacher name",
                weeks: "weeks",
                location: "room or location"
            };
            if (await save()) {
                await publishAnnouncement(
                    `${item.teacher || "A teacher"}: ${item.course || "A lecture"} updated (${fieldLabels[field.dataset.field] || "class details"}) for ${days[Number(cell.dataset.day)]} at ${times[Number(cell.dataset.row)]}.`
                );
            }
        });

        tableBody.addEventListener("click", async (clickEvent) => {
            if (suppressClick) {
                suppressClick = false;
                clickEvent.preventDefault();
                clickEvent.stopPropagation();
                return;
            }

            const addButton = clickEvent.target.closest(".add-lecture");
            if (addButton) {
                const cell = addButton.closest("td[data-row][data-day]");
                const row = Number(cell.dataset.row);
                const day = Number(cell.dataset.day);
                if (schedule[row][day].length !== 0) {
                    setStatus("Classes can only be added to an empty schedule slot.");
                    return;
                }
                selectedSource = null;
                addingSlot = { row, day };
                render();
                tableBody.querySelector(".add-lecture-form select")?.focus();
                return;
            }

            if (clickEvent.target.closest(".cancel-add-lecture")) {
                addingSlot = null;
                render();
                return;
            }

            const deleteButton = clickEvent.target.closest(".delete-lecture");
            if (deleteButton) {
                const card = deleteButton.closest(".schedule-event");
                const cell = card.closest("td[data-row][data-day]");
                const row = Number(cell.dataset.row);
                const day = Number(cell.dataset.day);
                const eventIndex = Number(card.dataset.eventIndex);
                const lecture = schedule[row][day][eventIndex];
                if (!canEditEvent(lecture)) {
                    setStatus("You can only delete classes assigned to your account.");
                    return;
                }
                if (!window.confirm(`Delete "${lecture.course}" from ${days[day]} at ${times[row]}?`)) {
                    return;
                }
                const [deletedEvent] = schedule[row][day].splice(eventIndex, 1);
                selectedSource = null;
                render();
                if (await save()) {
                    await publishAnnouncement(
                        `${deletedEvent.teacher || "A teacher"}: ${deletedEvent.course || "A lecture"} was deleted from ${days[day]} at ${times[row]}.`
                    );
                }
                return;
            }

            const handle = clickEvent.target.closest(".drag-handle");
            if (handle) {
                const card = handle.closest(".schedule-event");
                const cell = card.closest("td[data-row][data-day]");
                selectedSource = {
                    row: Number(cell.dataset.row),
                    day: Number(cell.dataset.day),
                    eventIndex: Number(card.dataset.eventIndex)
                };
                tableBody.querySelectorAll(".is-selected").forEach((selected) => {
                    selected.classList.remove("is-selected");
                });
                card.classList.add("is-selected");
                setStatus("Class selected. Choose an empty destination slot, or drag it to one.");
                return;
            }
            if (!selectedSource) {
                return;
            }
            const cell = clickEvent.target.closest("td[data-row][data-day]");
            if (cell) {
                moveEvent(selectedSource, {
                    row: Number(cell.dataset.row),
                    day: Number(cell.dataset.day)
                });
            }
        });

        tableBody.addEventListener("pointerdown", (pointerEvent) => {
            if (pointerEvent.pointerType === "mouse" || !pointerEvent.isPrimary) {
                return;
            }
            const handle = pointerEvent.target.closest(".drag-handle");
            if (!handle) {
                return;
            }
            const card = handle.closest(".schedule-event");
            const cell = card.closest("td[data-row][data-day]");
            touchDrag = {
                pointerId: pointerEvent.pointerId,
                startX: pointerEvent.clientX,
                startY: pointerEvent.clientY,
                source: {
                    row: Number(cell.dataset.row),
                    day: Number(cell.dataset.day),
                    eventIndex: Number(card.dataset.eventIndex)
                },
                active: false,
                target: null
            };
            handle.setPointerCapture(pointerEvent.pointerId);
        });

        tableBody.addEventListener("pointermove", (pointerEvent) => {
            if (!touchDrag || touchDrag.pointerId !== pointerEvent.pointerId) {
                return;
            }
            if (!touchDrag.active) {
                const deltaX = pointerEvent.clientX - touchDrag.startX;
                const deltaY = pointerEvent.clientY - touchDrag.startY;
                if (Math.hypot(deltaX, deltaY) < 8) {
                    return;
                }
                touchDrag.active = true;
                touchDrag.sourceCard = tableBody.querySelector(
                    `td[data-row="${touchDrag.source.row}"][data-day="${touchDrag.source.day}"] .schedule-event[data-event-index="${touchDrag.source.eventIndex}"]`
                );
                touchDrag.sourceCard?.classList.add("is-dragging");
            }

            pointerEvent.preventDefault();
            const target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
                ?.closest("td[data-row][data-day]");
            const targetIsEmpty = target &&
                schedule[Number(target.dataset.row)][Number(target.dataset.day)].length === 0;
            const targetIsSource = target &&
                Number(target.dataset.row) === touchDrag.source.row &&
                Number(target.dataset.day) === touchDrag.source.day;
            if (target && tableBody.contains(target) && (targetIsEmpty || targetIsSource)) {
                if (touchDrag.target !== target) {
                    touchDrag.target?.classList.remove("drop-target");
                    target.classList.add("drop-target");
                    touchDrag.target = target;
                }
            } else {
                touchDrag.target?.classList.remove("drop-target");
                touchDrag.target = null;
            }
        });

        const finishTouchDrag = (pointerEvent, cancelled = false) => {
            if (!touchDrag || touchDrag.pointerId !== pointerEvent.pointerId) {
                return;
            }
            const drag = touchDrag;
            touchDrag = null;
            drag.target?.classList.remove("drop-target");
            drag.sourceCard?.classList.remove("is-dragging");
            if (!drag.active) {
                return;
            }

            pointerEvent.preventDefault();
            suppressClick = true;
            window.setTimeout(() => {
                suppressClick = false;
            }, 0);
            const target = cancelled
                ? null
                : document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
                    ?.closest("td[data-row][data-day]");
            if (target && tableBody.contains(target)) {
                moveEvent(drag.source, {
                    row: Number(target.dataset.row),
                    day: Number(target.dataset.day)
                });
            } else {
                setStatus("Move cancelled.");
            }
        };

        tableBody.addEventListener("pointerup", (pointerEvent) => {
            finishTouchDrag(pointerEvent);
        });

        tableBody.addEventListener("pointercancel", (pointerEvent) => {
            finishTouchDrag(pointerEvent, true);
        });

        tableBody.addEventListener("dragstart", (dragEvent) => {
            const handle = dragEvent.target.closest(".drag-handle");
            if (!handle) {
                dragEvent.preventDefault();
                return;
            }
            const card = handle.closest(".schedule-event");
            const cell = card.closest("td[data-row][data-day]");
            const source = {
                row: Number(cell.dataset.row),
                day: Number(cell.dataset.day),
                eventIndex: Number(card.dataset.eventIndex)
            };
            nativeDragSource = source;
            dragEvent.dataTransfer.setData("text/plain", JSON.stringify(source));
            dragEvent.dataTransfer.effectAllowed = "move";
        });

        tableBody.addEventListener("dragover", (dragEvent) => {
            const cell = dragEvent.target.closest("td[data-row][data-day]");
            if (cell) {
                if (!nativeDragSource) {
                    cell.classList.remove("drop-target");
                    dragEvent.dataTransfer.dropEffect = "none";
                    return;
                }
                const isSameCell = Number(cell.dataset.row) === nativeDragSource.row &&
                    Number(cell.dataset.day) === nativeDragSource.day;
                const isEmpty = schedule[Number(cell.dataset.row)][Number(cell.dataset.day)].length === 0;
                if (!isEmpty && !isSameCell) {
                    cell.classList.remove("drop-target");
                    dragEvent.dataTransfer.dropEffect = "none";
                    return;
                }
                dragEvent.preventDefault();
                dragEvent.dataTransfer.dropEffect = "move";
                cell.classList.add("drop-target");
            }
        });

        tableBody.addEventListener("dragleave", (dragEvent) => {
            const cell = dragEvent.target.closest("td[data-row][data-day]");
            if (cell && !cell.contains(dragEvent.relatedTarget)) {
                cell.classList.remove("drop-target");
            }
        });

        tableBody.addEventListener("drop", (dropEvent) => {
            const cell = dropEvent.target.closest("td[data-row][data-day]");
            if (!cell) {
                return;
            }
            dropEvent.preventDefault();
            tableBody.querySelectorAll(".drop-target").forEach((target) => {
                target.classList.remove("drop-target");
            });
            try {
                const source = JSON.parse(dropEvent.dataTransfer.getData("text/plain"));
                if (!Number.isInteger(source.row) || !Number.isInteger(source.day) || !Number.isInteger(source.eventIndex)) {
                    throw new Error("Invalid drag source.");
                }
                moveEvent(source, {
                    row: Number(cell.dataset.row),
                    day: Number(cell.dataset.day)
                });
            } catch (error) {
                setStatus(`Could not move class: ${error.message}`);
            }
        });

        tableBody.addEventListener("dragend", () => {
            nativeDragSource = null;
            tableBody.querySelectorAll(".drop-target").forEach((cell) => {
                cell.classList.remove("drop-target");
            });
        });

        document.addEventListener("keydown", (keyEvent) => {
            if (keyEvent.key === "Escape" && selectedSource) {
                clearSelection();
                setStatus("Move cancelled.");
            }
        });

    }

    if (isSuperAdmin) {
        document.getElementById("reset-schedule")?.addEventListener("click", async () => {
            if (!window.confirm("Restore the original schedule? This will replace your saved changes.")) {
                return;
            }
            schedule = cloneDefault();
            render();
            if (await save()) {
                await publishAnnouncement("The class schedule was restored to its default timetable.");
            }
        });
    }

})();
