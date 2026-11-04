(async () => {
    const scheduleStorageKey = "class2-schedule";
    const weekNumberStorageKey = "class2-schedule-week-number";
    const weekNumberPendingKey = "class2-schedule-week-number-pending";
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
    const serializeSchedule = (value) => JSON.stringify(value);
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
    const parseFirestoreSchedule = (value) => {
        const parsedSchedule = typeof value === "string" ? JSON.parse(value) : value;
        if (!isValidSchedule(parsedSchedule)) {
            throw new Error("The Firebase schedule document has an invalid format.");
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
    let firebaseReady = false;
    let hasLocalScheduleChanges = false;
    let hasLocalWeekChanges = false;
    let hasLocalAnnouncementChanges = false;
    try {
        const savedWeekNumber = Number(localStorage.getItem(weekNumberStorageKey));
        if (isValidWeekNumber(savedWeekNumber)) {
            weekNumber = savedWeekNumber;
        }
        hasLocalWeekChanges = isValidWeekNumber(savedWeekNumber) &&
            localStorage.getItem(weekNumberPendingKey) === "true";
    } catch (error) {
        storageError = `Could not read the saved week number: ${error.message}`;
    }
    updateWeekNumberDisplay();
    render();
    renderAnnouncement(announcement);
    updateChinaClockAndHighlight();
    void syncChinaTime();
    window.setInterval(updateChinaClockAndHighlight, 1000);
    window.setInterval(syncChinaTime, 5 * 60 * 1000);
    window.addEventListener("resize", () => renderAnnouncement(announcement));
    setStatus("Opening the editor and connecting to Firebase...");

    let firebase;
    try {
        firebase = await import("./firebase.js");
    } catch (error) {
        storageError = `Could not load Firebase: ${error.message}. Check your internet connection.`;
    }
    const scheduleRef = firebase?.doc(firebase.db, "schedules", "current");
    const announcementRef = firebase?.doc(firebase.db, "announcements", "current");
    setStatus("Connecting to the shared schedule...");
    let startupTimeout;
    try {
        if (!firebase || !scheduleRef || !announcementRef) {
            throw new Error(storageError || "Firebase is not available.");
        }
        const [scheduleSnapshot, announcementSnapshot] = await Promise.race([
            Promise.all([
                firebase.getDoc(scheduleRef),
                firebase.getDoc(announcementRef)
            ]),
            new Promise((_, reject) => {
                startupTimeout = window.setTimeout(
                    () => reject(new Error("Firebase connection timed out")),
                    10000
                );
            })
        ]);
        if (scheduleSnapshot.exists()) {
            const savedData = scheduleSnapshot.data();
            const savedSchedule = parseFirestoreSchedule(savedData.schedule);
            const savedWeekNumber = savedData.weekNumber === undefined ? 9 : savedData.weekNumber;
            if (!isValidWeekNumber(savedWeekNumber)) {
                throw new Error("The Firebase schedule document has an invalid week number.");
            }
            if (hasLocalScheduleChanges || hasLocalWeekChanges) {
                if (!hasLocalScheduleChanges) {
                    schedule = savedSchedule;
                }
                if (!hasLocalWeekChanges) {
                    weekNumber = savedWeekNumber;
                }
                await firebase.setDoc(scheduleRef, {
                    schedule: serializeSchedule(schedule),
                    weekNumber
                });
                hasLocalScheduleChanges = false;
                hasLocalWeekChanges = false;
                localStorage.removeItem(weekNumberPendingKey);
            } else {
                schedule = savedSchedule;
                weekNumber = savedWeekNumber;
            }
        } else {
            const savedSchedule = localStorage.getItem(scheduleStorageKey);
            if (savedSchedule !== null && !hasLocalScheduleChanges) {
                const parsedSchedule = JSON.parse(savedSchedule);
                if (!isValidSchedule(parsedSchedule)) {
                    throw new Error("The locally saved schedule has an invalid format.");
                }
                schedule = parsedSchedule;
            }
            if (isAdmin && hasLocalWeekChanges) {
                weekNumber = Number(localStorage.getItem(weekNumberStorageKey));
            }
            if (isAdmin) {
                await firebase.setDoc(scheduleRef, {
                    schedule: serializeSchedule(schedule),
                    weekNumber
                });
                hasLocalScheduleChanges = false;
                hasLocalWeekChanges = false;
                localStorage.removeItem(weekNumberPendingKey);
            }
        }
        if (announcementSnapshot.exists()) {
            const savedAnnouncement = announcementSnapshot.data().message;
            if (typeof savedAnnouncement !== "string") {
                throw new Error("The Firebase announcement document has an invalid format.");
            }
            if (hasLocalAnnouncementChanges) {
                await firebase.setDoc(announcementRef, { message: announcement });
                hasLocalAnnouncementChanges = false;
            } else {
                announcement = savedAnnouncement;
            }
        } else if (isAdmin) {
            const savedAnnouncement = localStorage.getItem(announcementStorageKey);
            if (savedAnnouncement !== null && !hasLocalAnnouncementChanges) {
                announcement = savedAnnouncement;
            }
            await firebase.setDoc(announcementRef, { message: announcement });
            hasLocalAnnouncementChanges = false;
        } else {
            if (!hasLocalAnnouncementChanges) {
                announcement = localStorage.getItem(announcementStorageKey) ?? defaultAnnouncement;
            }
        }
        firebaseReady = true;
        editorReady = true;
    } catch (error) {
        storageError = `Could not connect to Firebase: ${error.message}. Check that Firestore is enabled and its rules are published.`;
        editorReady = true;
    } finally {
        window.clearTimeout(startupTimeout);
    }
    updateWeekNumberDisplay();
    if (weekNumberInput) {
        weekNumberInput.disabled = !isAdmin || !editorReady;
    }
    let selectedSource = null;
    let saveTimer;

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

    firebase?.onSnapshot(scheduleRef, (snapshot) => {
        const wasReady = firebaseReady;
        firebaseReady = true;
        editorReady = true;
        if (!wasReady) {
            setStatus("Connected to Firebase. Schedule changes sync across devices.");
            render();
        }
        if (!snapshot.exists()) {
            if (isAdmin) {
                firebase.setDoc(scheduleRef, {
                    schedule: serializeSchedule(schedule),
                    weekNumber
                }).catch((error) => {
                    setStatus(`Could not initialize the shared schedule: ${error.message}`);
                });
            }
            if (!isAdmin) {
                setStatus("Shared schedule is not set up yet. Ask an admin to sign in.");
            }
            return;
        }
        if (saveTimer || hasLocalScheduleChanges || hasLocalWeekChanges) {
            return;
        }
        let updatedSchedule;
        let updatedWeekNumber;
        try {
            updatedSchedule = parseFirestoreSchedule(snapshot.data().schedule);
            updatedWeekNumber = snapshot.data().weekNumber === undefined
                ? 9
                : snapshot.data().weekNumber;
            if (!isValidWeekNumber(updatedWeekNumber)) {
                throw new Error("The schedule document has an invalid week number.");
            }
        } catch (error) {
            setStatus(`Could not load schedule update: ${error.message}`);
            return;
        }
        if (JSON.stringify(updatedSchedule) !== JSON.stringify(schedule) ||
            updatedWeekNumber !== weekNumber) {
            schedule = updatedSchedule;
            weekNumber = updatedWeekNumber;
            updateWeekNumberDisplay();
            render();
            try {
                localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
                localStorage.setItem(weekNumberStorageKey, String(weekNumber));
                localStorage.removeItem(weekNumberPendingKey);
            } catch (error) {
                setStatus(`Schedule updated, but this browser could not cache it: ${error.message}`);
                return;
            }
            setStatus(isAdmin ? "Schedule updated from another device." : "Schedule updated.");
        }
    }, (error) => {
        editorReady = true;
        render();
        setStatus(`Could not listen for schedule updates: ${error.message}`);
    });

    firebase?.onSnapshot(announcementRef, (snapshot) => {
        const wasReady = firebaseReady;
        firebaseReady = true;
        editorReady = true;
        if (!wasReady) {
            setStatus("Connected to Firebase. Schedule changes sync across devices.");
            render();
        }
        if (!snapshot.exists()) {
            if (isAdmin) {
                firebase.setDoc(announcementRef, { message: announcement }).catch((error) => {
                    setStatus(`Could not initialize the notification: ${error.message}`);
                });
            }
            return;
        }
        const updatedAnnouncement = snapshot.data().message;
        if (typeof updatedAnnouncement !== "string") {
            setStatus("Could not load notification update: the Firebase announcement has an invalid format.");
            return;
        }
        if (updatedAnnouncement !== announcement) {
            announcement = updatedAnnouncement;
            renderAnnouncement(announcement);
            try {
                localStorage.setItem(announcementStorageKey, announcement);
            } catch (error) {
                setStatus(`Notification updated, but this browser could not cache it: ${error.message}`);
            }
        }
    }, (error) => {
        editorReady = true;
        render();
        setStatus(`Could not listen for notification updates: ${error.message}`);
    });

    if (storageError) {
        setStatus(storageError);
    }

    const publishAnnouncement = (message) => {
        announcement = message;
        renderAnnouncement(message);
        try {
            localStorage.setItem(announcementStorageKey, message);
            hasLocalAnnouncementChanges = true;
        } catch (error) {
            setStatus(`The notification is shown here, but could not be cached: ${error.message}`);
        }
        if (!firebaseReady) {
            setStatus("The notification is shown here but Firebase is not connected.");
            return;
        }
        firebase?.setDoc(announcementRef, { message }).then(() => {
            hasLocalAnnouncementChanges = false;
        }).catch((error) => {
            setStatus(`Schedule saved, but the notification could not be shared: ${error.message}`);
        });
    };

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
        setStatus(firebaseReady
            ? "Saving changes to the shared schedule..."
            : "Saving changes in this browser; Firebase is not connected...");
        window.clearTimeout(saveTimer);
        const persist = () => {
            saveTimer = undefined;
            if (!firebaseReady) {
                try {
                    localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
                    localStorage.setItem(weekNumberStorageKey, String(weekNumber));
                    hasLocalScheduleChanges = true;
                    if (hasLocalWeekChanges) {
                        localStorage.setItem(weekNumberPendingKey, "true");
                    }
                } catch (error) {
                    setStatus(`Could not save changes in this browser: ${error.message}`);
                    return;
                }
                setStatus("Changes saved in this browser only. Connect to Firebase to sync across devices.");
                return;
            }
            const savedSchedule = JSON.stringify(schedule);
            const savedWeekNumber = weekNumber;
            firebase.setDoc(scheduleRef, {
                schedule: serializeSchedule(schedule),
                weekNumber
            }).then(() => {
                const isCurrentSave = JSON.stringify(schedule) === savedSchedule &&
                    weekNumber === savedWeekNumber;
                if (isCurrentSave) {
                    hasLocalScheduleChanges = false;
                    hasLocalWeekChanges = false;
                }
                try {
                    localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
                    localStorage.setItem(weekNumberStorageKey, String(weekNumber));
                    if (isCurrentSave) {
                        localStorage.removeItem(weekNumberPendingKey);
                    }
                } catch (error) {
                    setStatus(`Schedule saved to Firebase, but could not be cached in this browser: ${error.message}`);
                    return;
                }
                setStatus("Changes saved. The schedule updates on other devices.");
            }).catch((error) => {
                setStatus(`Could not save changes to Firebase: ${error.message}`);
            });
        };
        if (debounce) {
            saveTimer = window.setTimeout(persist, 350);
        } else {
            persist();
        }
        return true;
    };

    const moveEvent = (source, target) => {
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
        if (save()) {
            publishAnnouncement(
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

        weekNumberInput?.addEventListener("input", () => {
            const nextWeekNumber = Number(weekNumberInput.value);
            if (!isValidWeekNumber(nextWeekNumber)) {
                return;
            }
            weekNumber = nextWeekNumber;
            hasLocalWeekChanges = true;
            try {
                localStorage.setItem(weekNumberStorageKey, String(weekNumber));
                localStorage.setItem(weekNumberPendingKey, "true");
            } catch (error) {
                setStatus(`Week number changed but could not be cached in this browser: ${error.message}`);
            }
            updateWeekNumberDisplay();
            save(true);
        });

        weekNumberInput?.addEventListener("change", () => {
            const nextWeekNumber = Number(weekNumberInput.value);
            if (!isValidWeekNumber(nextWeekNumber)) {
                weekNumberInput.value = String(weekNumber);
                setStatus("Week number must be between 1 and 53.");
            } else {
                save();
            }
        });

        tableBody.addEventListener("submit", (submitEvent) => {
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
            if (save()) {
                publishAnnouncement(
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

        tableBody.addEventListener("focusout", (focusEvent) => {
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
            if (save()) {
                publishAnnouncement(
                    `${item.teacher || "A teacher"}: ${item.course || "A lecture"} updated (${fieldLabels[field.dataset.field] || "class details"}) for ${days[Number(cell.dataset.day)]} at ${times[Number(cell.dataset.row)]}.`
                );
            }
        });

        tableBody.addEventListener("click", (clickEvent) => {
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
                if (save()) {
                    publishAnnouncement(
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
        document.getElementById("reset-schedule")?.addEventListener("click", () => {
            if (!window.confirm("Restore the original schedule? This will replace your saved changes.")) {
                return;
            }
            schedule = cloneDefault();
            render();
            if (save()) {
                publishAnnouncement("The class schedule was restored to its default timetable.");
            }
        });
    }

})();
