// script.js — Генератор постов (AI + VK + Избранное + Редактирование)

var currentPostText = "";
var currentPostUrl = "";
var currentPostMood = "";
var originalPostText = "";
// vkConfigured устанавливается в шаблоне (index.html)

// При загрузке страницы
document.addEventListener("DOMContentLoaded", function () {
    var form = document.querySelector("form");
    var loadingSection = document.getElementById("loadingSection");
    var generateBtn = document.getElementById("generateBtn");

    if (form && loadingSection) {
        form.addEventListener("submit", function () {
            loadingSection.style.display = "block";
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = "Генерация...";
            }
        });
    }

    // Сохраняем текст поста
    var postEl = document.getElementById("postContent");
    if (postEl) {
        currentPostText = postEl.innerText;
        originalPostText = currentPostText;
        var urlEl = document.getElementById("product_url");
        if (urlEl) currentPostUrl = urlEl.value;
        var moodEl = document.getElementById("mood");
        if (moodEl) currentPostMood = moodEl.value;
    }

    // Закрытие модалки по клику на фон
    var modal = document.getElementById("scheduleModal");
    if (modal) {
        modal.addEventListener("click", function (e) {
            if (e.target === modal) closeScheduleModal();
        });
    }
});

// ---- Копирование ----
function copyPost() {
    var text = getPostText();
    navigator.clipboard.writeText(text).then(function () {
        showNotification("copySuccess", "Пост скопирован!");
    }).catch(function () {
        fallbackCopy(text);
    });
}

function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand("copy");
        showNotification("copySuccess", "Пост скопирован!");
    } catch (err) {
        alert("Не удалось скопировать текст.");
    }
    document.body.removeChild(textarea);
}

// Получить актуальный текст (из поля редактирования или из поста)
function getPostText() {
    var editArea = document.getElementById("postEditArea");
    if (editArea) return editArea.value;
    return document.getElementById("postContent").innerText;
}

// ---- Редактирование сгенерированного поста ----
function startEditResult() {
    var postContent = document.getElementById("postContent");
    var postEdit = document.getElementById("postEdit");
    var postEditArea = document.getElementById("postEditArea");

    postEditArea.value = postContent.innerText;
    originalPostText = postContent.innerText;

    document.querySelector(".post-display").style.display = "none";
    postEdit.style.display = "block";
    postEditArea.focus();
}

function cancelEditResult() {
    document.querySelector(".post-display").style.display = "block";
    document.getElementById("postEdit").style.display = "none";
}

function saveEditResult() {
    var newText = document.getElementById("postEditArea").value;
    if (!newText.trim()) {
        alert("Текст не может быть пустым!");
        return;
    }

    // Обновляем отображение
    var postContent = document.getElementById("postContent");
    postContent.innerHTML = escapeHtml(newText).replace(/\n/g, "<br>");

    // Обновляем переменные
    currentPostText = newText;

    // Переключаем обратно
    document.querySelector(".post-display").style.display = "block";
    document.getElementById("postEdit").style.display = "none";

    showNotification("copySuccess", "Пост сохранён!");
}

// ---- Избранное ----
function addToFavorites() {
    var text = getPostText();
    fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, url: currentPostUrl, mood: currentPostMood }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.success) {
            appendFavCard(data.id, text, currentPostMood);
            updateFavCount(1);
            showNotification("favBtn", "Добавлено в избранное!");
        }
    });
}

function deleteFavorite(id) {
    fetch("/api/favorites/" + id, { method: "DELETE" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.success) {
            var card = document.querySelector(".fav-card[data-id='" + id + "']");
            if (card) card.remove();
            updateFavCount(-1);
        }
    });
}

function appendFavCard(id, text, mood) {
    var list = document.getElementById("favoritesList");
    var emptyMsg = list.querySelector(".empty-state");
    if (emptyMsg) emptyMsg.remove();

    var now = new Date();
    var dateStr = now.toLocaleDateString("ru-RU") + " " + now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

    var card = document.createElement("div");
    card.className = "fav-card";
    card.setAttribute("data-id", id);
    card.innerHTML =
        '<div class="fav-display" id="favDisplay-' + id + '">' +
            '<div class="fav-text">' + escapeHtml(text).replace(/\n/g, "<br>") + '</div>' +
        '</div>' +
        '<div class="fav-edit-area" id="favEdit-' + id + '" style="display: none;">' +
            '<textarea class="fav-edit-textarea" rows="6">' + escapeHtml(text) + '</textarea>' +
            '<div class="edit-actions">' +
                '<button class="btn-cancel-edit" onclick="cancelEditFav(\'' + id + '\')">Отмена</button>' +
                '<button class="btn-save-edit" onclick="saveEditFav(\'' + id + '\')">Сохранить</button>' +
            '</div>' +
        '</div>' +
        '<div class="fav-meta">' +
            '<span>' + dateStr + '</span>' +
            (mood ? '<span class="fav-mood">' + mood + '</span>' : '') +
            '<button class="btn-edit-inline" onclick="startEditFav(\'' + id + '\')" title="Редактировать">' + pencilSvg() + '</button>' +
            '<button class="btn-use-fav" onclick="useFavorite(\'' + id + '\')">Использовать</button>' +
            '<button class="btn-delete" onclick="deleteFavorite(\'' + id + '\')">Удалить</button>' +
        '</div>';
    list.insertBefore(card, list.firstChild);
}

function updateFavCount(delta) {
    var badge = document.getElementById("favCount");
    if (badge) badge.textContent = parseInt(badge.textContent) + delta;
}

// ---- Редактирование избранного ----
function startEditFav(id) {
    document.getElementById("favDisplay-" + id).style.display = "none";
    document.getElementById("favEdit-" + id).style.display = "block";
}

function cancelEditFav(id) {
    document.getElementById("favDisplay-" + id).style.display = "block";
    document.getElementById("favEdit-" + id).style.display = "none";
}

function saveEditFav(id) {
    var textarea = document.querySelector("#favEdit-" + id + " .fav-edit-textarea");
    var newText = textarea.value;
    if (!newText.trim()) {
        alert("Текст не может быть пустым!");
        return;
    }

    fetch("/api/favorites/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newText }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.success) {
            var displayText = document.querySelector("#favDisplay-" + id + " .fav-text");
            displayText.innerHTML = escapeHtml(newText).replace(/\n/g, "<br>");
            document.getElementById("favDisplay-" + id).style.display = "block";
            document.getElementById("favEdit-" + id).style.display = "none";
            showNotification("copySuccess", "Пост обновлён!");
        }
    });
}

// Использовать избранный пост — перенести в основной блок
function useFavorite(id) {
    var display = document.querySelector("#favDisplay-" + id + " .fav-text");
    var text = display.innerText;

    // Проверяем, есть ли уже сгенерированный пост на странице
    var resultSection = document.querySelector(".result-section");
    if (resultSection) {
        // Обновляем существующий пост
        document.getElementById("postContent").innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
        currentPostText = text;
    } else {
        // Создаём блок результата
        var form = document.querySelector(".post-form");
        var newSection = document.createElement("div");
        newSection.className = "result-section";
        newSection.innerHTML =
            '<div class="result-header">' +
                '<h2>Готовый пост</h2>' +
                '<div class="result-actions">' +
                    '<button class="btn-copy" onclick="copyPost()">Скопировать</button>' +
                    '<button class="btn-fav" onclick="addToFavorites()">В избранное</button>' +
                    '<button class="btn-publish" onclick="publishNow()">Опубликовать</button>' +
                    '<button class="btn-schedule" onclick="showScheduleModal()">Отложить</button>' +
                '</div>' +
            '</div>' +
            '<div class="post-display">' +
                '<div class="post-content" id="postContent">' + escapeHtml(text).replace(/\n/g, "<br>") + '</div>' +
                '<button class="btn-edit" onclick="startEditResult()" title="Редактировать">' + pencilSvg() + '</button>' +
            '</div>' +
            '<div class="post-edit" id="postEdit" style="display: none;">' +
                '<textarea id="postEditArea" rows="10"></textarea>' +
                '<div class="edit-actions">' +
                    '<button class="btn-cancel-edit" onclick="cancelEditResult()">Отмена</button>' +
                    '<button class="btn-save-edit" onclick="saveEditResult()">Сохранить</button>' +
                '</div>' +
            '</div>' +
            '<div class="copy-success" id="copySuccess">Пост скопирован!</div>' +
            '<div class="copy-success" id="publishSuccess" style="background: #eff6ff; border-color: #bfdbfe; color: #2563eb;">Пост опубликован!</div>';

        form.parentNode.insertBefore(newSection, form.nextSibling);
    }

    currentPostText = text;
    showNotification("publishSuccess", "Пост загружен — можно публиковать!");

    // Скроллим к посту
    var target = resultSection || document.querySelector(".result-section");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- Публикация в VK ----
function publishNow() {
    if (!vkConfigured) {
        alert("VK не настроен.\n\nОткройте voice.md → раздел «Подключение ВКонтакте».");
        return;
    }
    var text = getPostText();

    fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.success) {
            showNotification("publishSuccess", "Пост опубликован!");
        } else {
            alert("Ошибка публикации: " + data.error);
        }
    });
}

// ---- Отложенная публикация ----
function showScheduleModal() {
    if (!vkConfigured) {
        alert("VK не настроен.\n\nОткройте voice.md → раздел «Подключение ВКонтакте».");
        return;
    }
    document.getElementById("scheduleModal").classList.add("active");
    var dtInput = document.getElementById("scheduleDate");
    var now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    var hours = String(now.getHours()).padStart(2, "0");
    var minutes = String(now.getMinutes()).padStart(2, "0");
    dtInput.min = year + "-" + month + "-" + day + "T" + hours + ":" + minutes;
    dtInput.value = year + "-" + month + "-" + day + "T" + hours + ":" + minutes;
}

function closeScheduleModal() {
    document.getElementById("scheduleModal").classList.remove("active");
}

function schedulePost() {
    var scheduleDate = document.getElementById("scheduleDate").value;
    if (!scheduleDate) {
        alert("Выберите дату и время!");
        return;
    }

    var text = getPostText();

    fetch("/api/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            text: text,
            schedule_date: scheduleDate,
            url: currentPostUrl,
            mood: currentPostMood,
        }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.success) {
            closeScheduleModal();
            appendSchedCard(data.id, text, scheduleDate);
            updateSchedCount(1);
            showNotification("publishSuccess", "Пост запланирован!");
        } else {
            alert("Ошибка: " + data.error);
        }
    });
}

function deleteScheduled(id) {
    fetch("/api/scheduled/" + id, { method: "DELETE" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.success) {
            var card = document.querySelector(".sched-card[data-id='" + id + "']");
            if (card) card.remove();
            updateSchedCount(-1);
        }
    });
}

function appendSchedCard(id, text, scheduleDate) {
    var list = document.getElementById("scheduledList");
    var emptyMsg = list.querySelector(".empty-state");
    if (emptyMsg) emptyMsg.remove();

    var dateFormatted = scheduleDate.replace("T", " ");

    var card = document.createElement("div");
    card.className = "sched-card";
    card.setAttribute("data-id", id);
    card.innerHTML =
        '<div class="sched-display" id="schedDisplay-' + id + '">' +
            '<div class="sched-text">' + escapeHtml(text).replace(/\n/g, "<br>") + '</div>' +
        '</div>' +
        '<div class="sched-edit-area" id="schedEdit-' + id + '" style="display: none;">' +
            '<textarea class="sched-edit-textarea" rows="6">' + escapeHtml(text) + '</textarea>' +
            '<div class="edit-actions">' +
                '<button class="btn-cancel-edit" onclick="cancelEditSched(\'' + id + '\')">Отмена</button>' +
                '<button class="btn-save-edit" onclick="saveEditSched(\'' + id + '\')">Сохранить</button>' +
            '</div>' +
        '</div>' +
        '<div class="sched-meta">' +
            '<span class="sched-date">📅 ' + dateFormatted + '</span>' +
            '<span class="sched-status">Ожидает ⏳</span>' +
            '<button class="btn-edit-inline" onclick="startEditSched(\'' + id + '\')" title="Редактировать">' + pencilSvg() + '</button>' +
            '<button class="btn-delete" onclick="deleteScheduled(\'' + id + '\')">Удалить</button>' +
        '</div>';
    list.insertBefore(card, list.firstChild);
}

function updateSchedCount(delta) {
    var badge = document.getElementById("schedCount");
    if (badge) badge.textContent = parseInt(badge.textContent) + delta;
}

// ---- Редактирование отложенного поста ----
function startEditSched(id) {
    document.getElementById("schedDisplay-" + id).style.display = "none";
    document.getElementById("schedEdit-" + id).style.display = "block";
}

function cancelEditSched(id) {
    document.getElementById("schedDisplay-" + id).style.display = "block";
    document.getElementById("schedEdit-" + id).style.display = "none";
}

function saveEditSched(id) {
    var textarea = document.querySelector("#schedEdit-" + id + " .sched-edit-textarea");
    var newText = textarea.value;
    if (!newText.trim()) {
        alert("Текст не может быть пустым!");
        return;
    }

    fetch("/api/scheduled/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newText }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.success) {
            var displayText = document.querySelector("#schedDisplay-" + id + " .sched-text");
            displayText.innerHTML = escapeHtml(newText).replace(/\n/g, "<br>");
            document.getElementById("schedDisplay-" + id).style.display = "block";
            document.getElementById("schedEdit-" + id).style.display = "none";
            showNotification("copySuccess", "Пост обновлён!");
        } else {
            alert("Ошибка: " + data.error);
        }
    });
}

// ---- Утилиты ----
function showNotification(elementId, message) {
    var el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    setTimeout(function () {
        el.style.display = "none";
    }, 2500);
}

function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function pencilSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
        '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>' +
        '</svg>';
}
