(async () => {
    const scheduleStorageKey = "class2-schedule";
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
    const isAdmin = document.body.dataset.admin === "true";
    const isSuperAdmin = document.body.dataset.adminRole === "super";
    const adminTeacher = document.body.dataset.adminTeacher?.trim().toUpperCase();
    let editorReady = true;
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
    let storageError = "";
    let firebaseReady = false;
    let hasLocalScheduleChanges = false;
    let hasLocalAnnouncementChanges = false;
    render();
    renderAnnouncement(announcement);
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
            const savedSchedule = parseFirestoreSchedule(scheduleSnapshot.data().schedule);
            if (hasLocalScheduleChanges) {
                await firebase.setDoc(scheduleRef, { schedule: serializeSchedule(schedule) });
                hasLocalScheduleChanges = false;
            } else {
                schedule = savedSchedule;
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
            if (isAdmin) {
                await firebase.setDoc(scheduleRef, { schedule: serializeSchedule(schedule) });
                hasLocalScheduleChanges = false;
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
                firebase.setDoc(scheduleRef, { schedule: serializeSchedule(schedule) }).catch((error) => {
                    setStatus(`Could not initialize the shared schedule: ${error.message}`);
                });
            }
            if (!isAdmin) {
                setStatus("Shared schedule is not set up yet. Ask an admin to sign in.");
            }
            return;
        }
        if (saveTimer) {
            return;
        }
        let updatedSchedule;
        try {
            updatedSchedule = parseFirestoreSchedule(snapshot.data().schedule);
        } catch (error) {
            setStatus(`Could not load schedule update: ${error.message}`);
            return;
        }
        if (JSON.stringify(updatedSchedule) !== JSON.stringify(schedule)) {
            schedule = updatedSchedule;
            render();
            try {
                localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
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
                    const placeholder = document.createElement("span");
                    placeholder.className = "empty-slot-hint";
                    placeholder.textContent = "Drop class here";
                    cell.append(placeholder);
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
                    hasLocalScheduleChanges = true;
                } catch (error) {
                    setStatus(`Could not save changes in this browser: ${error.message}`);
                    return;
                }
                setStatus("Changes saved in this browser only. Connect to Firebase to sync across devices.");
                return;
            }
            const savedSchedule = JSON.stringify(schedule);
            firebase.setDoc(scheduleRef, { schedule: serializeSchedule(schedule) }).then(() => {
                if (JSON.stringify(schedule) === savedSchedule) {
                    hasLocalScheduleChanges = false;
                }
                try {
                    localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
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
                setStatus("Class selected. Choose a destination cell, or drag it to a new slot.");
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
            if (target && tableBody.contains(target)) {
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
            dragEvent.dataTransfer.setData("text/plain", JSON.stringify(source));
            dragEvent.dataTransfer.effectAllowed = "move";
        });

        tableBody.addEventListener("dragover", (dragEvent) => {
            const cell = dragEvent.target.closest("td[data-row][data-day]");
            if (cell) {
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
