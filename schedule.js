(() => {
    const storageKey = "class-2-schedule-data";
    const announcementKey = "class-2-schedule-announcement";
    const introductionAiMigrationKey = "class-2-schedule-introduction-ai-v1";
    const afternoonScheduleMigrationKey = "class-2-afternoon-schedule-v1";
    const heDongMigrationKey = "class-2-he-dong-ai-teacher-v1";
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
    const setStatus = (message) => {
        if (status) {
            status.textContent = message;
        }
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
            groups.forEach((group) => {
                group.replaceChildren();
                let firstMessage;
                do {
                    const tickerItem = document.createElement("span");
                    tickerItem.className = "event-message";
                    tickerItem.textContent = message;
                    group.append(tickerItem);
                    firstMessage ??= tickerItem;
                } while (group.scrollWidth < bar.clientWidth + firstMessage.offsetWidth);
            });
            track.style.animationDuration = `${Math.max(12, groups[0].scrollWidth / 70)}s`;
        });
    };

    const publishAnnouncement = (message) => {
        renderAnnouncement(message);
        try {
            localStorage.setItem(announcementKey, JSON.stringify({
                message,
                updatedAt: Date.now()
            }));
        } catch (error) {
            setStatus(`Schedule saved, but the alert could not be updated: ${error.message}`);
        }
    };

    try {
        const savedAnnouncement = localStorage.getItem(announcementKey);
        if (savedAnnouncement !== null) {
            const parsedAnnouncement = JSON.parse(savedAnnouncement);
            if (typeof parsedAnnouncement.message !== "string") {
                throw new Error("Saved announcement has an invalid format.");
            }
            renderAnnouncement(parsedAnnouncement.message);
        } else {
            renderAnnouncement(defaultAnnouncement);
        }
    } catch (error) {
        renderAnnouncement(defaultAnnouncement);
        setStatus(`Could not load the saved alert: ${error.message}`);
    }

    window.addEventListener("resize", () => {
        try {
            const savedAnnouncement = localStorage.getItem(announcementKey);
            const parsedAnnouncement = savedAnnouncement === null ? null : JSON.parse(savedAnnouncement);
            renderAnnouncement(typeof parsedAnnouncement?.message === "string" ? parsedAnnouncement.message : defaultAnnouncement);
        } catch (error) {
            setStatus(`Could not refresh the alert: ${error.message}`);
        }
    });

    let schedule = cloneDefault();
    let selectedSource = null;
    let scheduleSaved = true;

    try {
        const savedSchedule = localStorage.getItem(storageKey);
        if (savedSchedule !== null) {
            const parsedSchedule = JSON.parse(savedSchedule);
            if (!isValidSchedule(parsedSchedule)) {
                throw new Error("Saved schedule has an invalid format.");
            }
            schedule = parsedSchedule;
        }
    } catch (error) {
        setStatus(`Could not load the saved schedule: ${error.message}`);
    }

    const renderField = (item, field, label, parent, admin) => {
        const element = document.createElement(field === "course" ? "strong" : "span");
        element.className = `schedule-${field}`;
        element.dataset.field = field;
        element.textContent = item[field];
        if (admin) {
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
    };

    const render = () => {
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

                    if (isAdmin) {
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

                    renderField(item, "course", "Class name", card, isAdmin);
                    renderField(item, "teacher", "Teacher name", card, isAdmin);
                    renderField(item, "weeks", "Class weeks", card, isAdmin);
                    if (item.location) {
                        renderField(item, "location", "Room or location", card, isAdmin);
                    } else if (isAdmin) {
                        renderField(item, "location", "Room or location", card, isAdmin);
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
    };

    const save = () => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(schedule));
            scheduleSaved = true;
            setStatus("Changes saved automatically. The schedule page updates in open tabs.");
            return true;
        } catch (error) {
            scheduleSaved = false;
            setStatus(`Could not save changes in this browser: ${error.message}`);
            return false;
        }
    };

    try {
        if (localStorage.getItem(introductionAiMigrationKey) === null) {
            const tuesdayTwoPm = schedule[2][1];
            const alreadyAdded = tuesdayTwoPm.some(
                (item) => item.course.trim().toLowerCase() === "introduction to ai"
            );
            if (alreadyAdded) {
                localStorage.setItem(introductionAiMigrationKey, "complete");
            } else {
                tuesdayTwoPm.unshift(event("Introduction to AI", "HE DONG", "Week 8-15", "Room 1505"));
                if (save()) {
                    localStorage.setItem(introductionAiMigrationKey, "complete");
                    publishAnnouncement("HE DONG: Introduction to AI added to Tuesday at 2:00 PM-3:30 PM.");
                }
            }
        }
    } catch (error) {
        setStatus(`Could not add Introduction to AI to Tuesday at 2:00 PM: ${error.message}`);
    }

    try {
        if (localStorage.getItem(afternoonScheduleMigrationKey) === null) {
            const moveLecture = (sourceSlot, targetSlot, courseName) => {
                const sourceIndex = sourceSlot.findIndex(
                    (item) => item.course.trim().toLowerCase() === courseName &&
                        item.teacher.trim().toUpperCase() === "ZHANG YAN"
                );
                if (sourceIndex === -1) {
                    return false;
                }
                const [lecture] = sourceSlot.splice(sourceIndex, 1);
                const alreadyInTarget = targetSlot.some(
                    (item) => item.course.trim().toLowerCase() === courseName &&
                        item.teacher.trim().toUpperCase() === "ZHANG YAN"
                );
                if (!alreadyInTarget) {
                    targetSlot.push(lecture);
                }
                return true;
            };
            const movedBasicChinese = moveLecture(schedule[2][1], schedule[2][2], "basic chinese");
            const movedAestheticEducation = moveLecture(schedule[2][2], schedule[2][3], "aesthetic education");
            if (!movedBasicChinese && !movedAestheticEducation) {
                localStorage.setItem(afternoonScheduleMigrationKey, "complete");
            } else if (save()) {
                localStorage.setItem(afternoonScheduleMigrationKey, "complete");
                publishAnnouncement("ZHANG YAN: Basic Chinese moved to Wednesday at 2:00 PM and Aesthetic Education moved to Thursday at 2:00 PM.");
            }
        }
    } catch (error) {
        setStatus(`Could not update the Tuesday, Wednesday, and Thursday 2:00 PM schedule: ${error.message}`);
    }

    try {
        if (localStorage.getItem(heDongMigrationKey) === null) {
            let updated = false;
            schedule.forEach((row) => row.forEach((slot) => {
                slot.forEach((item) => {
                    if (item.course.trim().toLowerCase() === "introduction to ai") {
                        item.teacher = "HE DONG";
                        item.weeks = "Week 8-15";
                        item.location = "Room 1505";
                        updated = true;
                    }
                });
            }));
            if (!updated || save()) {
                localStorage.setItem(heDongMigrationKey, "complete");
                if (updated) {
                    publishAnnouncement("HE DONG: Introduction to AI updated to Week 8-15 in Room 1505.");
                }
            }
        }
    } catch (error) {
        setStatus(`Could not update the Introduction to AI teacher and class details: ${error.message}`);
    }

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

    render();
    if (isAdmin && !status?.textContent) {
        setStatus("Changes save automatically. Drag a class or select Move, then choose a destination.");
    }

    if (isAdmin) {
        tableBody.addEventListener("focusin", (focusEvent) => {
            const field = focusEvent.target.closest("[data-field]");
            if (field) {
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
            save();
        });

        tableBody.addEventListener("focusout", (focusEvent) => {
            const field = focusEvent.target.closest("[data-field]");
            const card = field?.closest(".schedule-event");
            const cell = card?.closest("td[data-row][data-day]");
            if (!field || !card || !cell) {
                return;
            }
            const currentValue = field.textContent.replace(/\s+/g, " ").trim();
            const originalValue = field.dataset.originalValue ?? currentValue;
            delete field.dataset.originalValue;
            if (currentValue === originalValue) {
                return;
            }
            const item = schedule[Number(cell.dataset.row)][Number(cell.dataset.day)][Number(card.dataset.eventIndex)];
            const fieldLabels = {
                course: "lecture name",
                teacher: "teacher name",
                weeks: "weeks",
                location: "room or location"
            };
            if (scheduleSaved) {
                publishAnnouncement(
                    `${item.teacher || "A teacher"}: ${item.course || "A lecture"} updated (${fieldLabels[field.dataset.field] || "class details"}) for ${days[Number(cell.dataset.day)]} at ${times[Number(cell.dataset.row)]}.`
                );
            }
        });

        tableBody.addEventListener("click", (clickEvent) => {
            const deleteButton = clickEvent.target.closest(".delete-lecture");
            if (deleteButton) {
                const card = deleteButton.closest(".schedule-event");
                const cell = card.closest("td[data-row][data-day]");
                const row = Number(cell.dataset.row);
                const day = Number(cell.dataset.day);
                const eventIndex = Number(card.dataset.eventIndex);
                const lecture = schedule[row][day][eventIndex];
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

    window.addEventListener("storage", (storageEvent) => {
        if (storageEvent.key === announcementKey) {
            try {
                const updatedAnnouncement = storageEvent.newValue === null
                    ? null
                    : JSON.parse(storageEvent.newValue);
                if (updatedAnnouncement !== null && typeof updatedAnnouncement.message !== "string") {
                    throw new Error("Saved announcement has an invalid format.");
                }
                renderAnnouncement(updatedAnnouncement?.message || defaultAnnouncement);
            } catch (error) {
                setStatus(`Could not load the alert update: ${error.message}`);
            }
            return;
        }
        if (storageEvent.key !== storageKey) {
            return;
        }
        try {
            if (storageEvent.newValue === null) {
                schedule = cloneDefault();
            } else {
                const updatedSchedule = JSON.parse(storageEvent.newValue);
                if (!isValidSchedule(updatedSchedule)) {
                    throw new Error("Saved schedule has an invalid format.");
                }
                schedule = updatedSchedule;
            }
            render();
            setStatus(isAdmin ? "Schedule updated from another open admin page." : "Schedule updated from the admin page.");
        } catch (error) {
            setStatus(`Could not load the schedule update: ${error.message}`);
        }
    });
})();
