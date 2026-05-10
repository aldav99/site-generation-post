# app.py — Генератор постов для товара (AI + VK + Избранное)
# Для запуска: pip install flask requests, затем python app.py

import json
import os
import uuid
from datetime import datetime
import re
import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# ============================================================
# НАСТРОЙКИ VK API
#
# КАК ПОЛУЧИТЬ ДАННЫЕ (подробно):
# 1. Создайте приложение VK: https://vk.com/editapp?act=create
#    - Тип: «Standalone-приложение»
#    - Назовите как угодно (например, «Генератор постов»)
#
# 2. Получите Access Token:
#    - Откройте в браузере:
#      https://oauth.vk.com/authorize?client_id=ВАШ_APP_ID&display=page&scope=wall,groups,offline&response_type=token&redirect_uri=https://oauth.vk.com/blank.html
#    - Замените ВАШ_APP_ID на ID вашего приложения (см. в настройках приложения)
#    - Разрешите доступ — после этого в адресной строке появится:
#      https://oauth.vk.com/blank.html#access_token=ТУТ_ВАШ_ТОКЕН&expires_in=0&user_id=...
#    - Скопируйте значение access_token (это длинная строка)
#
# 3. Узнайте ID группы:
#    - Откройте вашу группу ВКонтакте
#    - Посмотрите на URL: https://vk.com/club123456789
#    - ID группы = число после «club», то есть 123456789 (без нуля)
#    - Если URL https://vk.com/mygroup — откройте Управление → настройки,
#      там будет «ID группы: 123456789»
#
# 4. Вставьте значения ниже:
# ============================================================
VK_ACCESS_TOKEN = "vk1.a.kOCHEz-uQdMqcekkHUzfJfj5eFasCkMbX1xJzusz9itNYNs2809EJGevjbfF8OexlPsIeF5A_O2hnUjaH3kAoZp9rKnniLoWL0Jr94dLpPRzFVEoaYbno9o-H0qdMMuB_z1426TTw8qlvNF24VIGCfWGhKA3rB_nZZuXHNT5fkt6JlAK7XW108XQbVWrT0UkNVahUpNhyM3JhdHlTGheJQ"   # Вставьте ваш токен сюда
VK_GROUP_ID = "238484741"       # Вставьте ID группы

# Версия VK API (последняя стабильная)
VK_API_VERSION = "5.207"

# ============================================================
# КЛЮЧ API — ProxyAPI (для AI-генерации)
# ============================================================
PROXY_API_KEY = "sk-14UvOHegnTGeC2RQAwEKzmPaa3oHR29E"
PROXY_API_URL = "https://api.proxyapi.ru/openai/v1/chat/completions"

# ============================================================
# НАСТРОЙКИ AI-генерации (voice)
# ============================================================
DEFAULT_CONFIG = {
    "model": "gpt-5.4-nano",
    "mood": "enthusiastic",
    "length": "medium",
    "language": "ru",
}

# Пути к файлам данных (избранное и отложенные посты)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FAVS_FILE = os.path.join(BASE_DIR, "favs.json")
SCHEDULED_FILE = os.path.join(BASE_DIR, "scheduled.json")

# ============================================================
# ФАЙЛЫ ДАННЫХ — чтение и запись
# ============================================================
def load_json(filepath):
    """Загружает список из JSON-файла. Если файла нет — возвращает []."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_json(filepath, data):
    """Сохраняет список в JSON-файл."""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================================
# ПАРСИНГ СТРАНИЦЫ ТОВАРА
# ============================================================
def fetch_page_info(url):
    """Загружает HTML страницы и извлекает title и meta description."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        html = response.text

        title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else ""

        desc_match = re.search(
            r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']',
            html, re.IGNORECASE | re.DOTALL,
        )
        description = desc_match.group(1).strip() if desc_match else ""

        og_title_match = re.search(
            r'<meta\s+property=["\']og:title["\']\s+content=["\'](.*?)["\']',
            html, re.IGNORECASE | re.DOTALL,
        )
        og_title = og_title_match.group(1).strip() if og_title_match else ""

        og_desc_match = re.search(
            r'<meta\s+property=["\']og:description["\']\s+content=["\'](.*?)["\']',
            html, re.IGNORECASE | re.DOTALL,
        )
        og_description = og_desc_match.group(1).strip() if og_desc_match else ""

        return {
            "title": title,
            "description": description,
            "og_title": og_title,
            "og_description": og_description,
        }
    except Exception as e:
        return {"title": "", "description": "", "og_title": "", "og_description": "", "error": str(e)}


# ============================================================
# ПРОМПТ ДЛЯ AI
# ============================================================
def build_prompt(page_info, config):
    """Создаёт промпт для языковой модели."""
    mood_map = {
        "enthusiastic": "восторженный, энергичный, с восклицаниями",
        "calm": "спокойный, мягкий, доверительный",
        "humorous": "с юмором, лёгкий, с забавными оборотами",
        "professional": "деловой, экспертный, сдержанный",
        "creative": "креативный, нестандартный, с необычными метафорами",
    }

    length_map = {
        "short": "2-3 предложения, короткий пост для Stories или быстрого обновления",
        "medium": "1-2 абзаца, стандартный пост для соцсетей",
        "long": "3-4 абзаца, развёрнутый обзор с подробностями",
    }

    product_info = []
    if page_info.get("og_title"):
        product_info.append(f"Название: {page_info['og_title']}")
    elif page_info.get("title"):
        product_info.append(f"Название: {page_info['title']}")

    if page_info.get("og_description"):
        product_info.append(f"Описание: {page_info['og_description']}")
    elif page_info.get("description"):
        product_info.append(f"Описание: {page_info['description']}")

    product_info.append(f"Ссылка на товар: {page_info.get('url', '')}")

    info_text = "\n".join(product_info) if product_info else "Информация о товаре не найдена"

    prompt = f"""Ты — опытный копирайтер. Напиши пост для соцсетей о товаре.

Информация о товаре:
{info_text}

Требования:
- Настроение: {mood_map.get(config['mood'], 'восторженный')}
- Длина: {length_map.get(config['length'], '1-2 абзаца')}
- Язык: {config['language']}
- Добавь подходящие эмодзи
- Сделай пост оригинальным, интересным, с призывом к действию
- НЕ упоминай, что это AI-генерация
- НЕ используй фразы вроде «как языковая модель»

Только текст поста, без пояснений и кавычек."""

    return prompt


# ============================================================
# ЗАПРОС К PROXYAPI
# ============================================================
def generate_post_with_ai(url, config):
    """Отправляет запрос к ProxyAPI и возвращает сгенерированный пост."""
    page_info = fetch_page_info(url)
    page_info["url"] = url

    if page_info.get("error"):
        page_info["title"] = f"Товар по ссылке {url}"

    prompt = build_prompt(page_info, config)

    payload = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": "Ты — профессиональный копирайтер для социальных сетей."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.8,
        "max_completion_tokens": 500,
    }

    headers = {
        "Authorization": f"Bearer {PROXY_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(PROXY_API_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        post = data["choices"][0]["message"]["content"].strip()
        return post
    except requests.exceptions.Timeout:
        return "Ошибка: превышено время ожидания ответа от AI. Попробуйте ещё раз."
    except requests.exceptions.RequestException as e:
        return f"Ошибка подключения к API: {e}"
    except (KeyError, IndexError):
        return "Ошибка: не удалось распознать ответ от AI. Попробуйте ещё раз."


# ============================================================
# VK API — публикация постов
# ============================================================
def publish_to_vk(text, is_scheduled=False, schedule_date=None):
    """
    Публикует пост в группе ВКонтакте.
    Returns: {"success": True, "post_id": ...} или {"success": False, "error": ...}
    """
    if not VK_ACCESS_TOKEN or not VK_GROUP_ID:
        return {"success": False, "error": "VK не настроен. Добавьте токен и ID группы в app.py"}

    if is_scheduled and schedule_date:
        # Отложенный пост — конвертируем дату в Unix timestamp
        publish_time = int(datetime.strptime(schedule_date, "%Y-%m-%dT%H:%M").timestamp())
        method = "wall.post"
        params = {
            "owner_id": f"-{VK_GROUP_ID}",  # Минус = публикация в группе
            "message": text,
            "publish_date": publish_time,
            "access_token": VK_ACCESS_TOKEN,
            "v": VK_API_VERSION,
        }
    else:
        # Публикация сразу
        method = "wall.post"
        params = {
            "owner_id": f"-{VK_GROUP_ID}",
            "message": text,
            "access_token": VK_ACCESS_TOKEN,
            "v": VK_API_VERSION,
        }

    try:
        url = f"https://api.vk.com/method/{method}"
        response = requests.post(url, data=params, timeout=15)
        data = response.json()

        if "error" in data:
            error_msg = data["error"].get("error_msg", "Неизвестная ошибка VK API")
            return {"success": False, "error": error_msg}

        post_id = data["response"].get("post_id")
        return {"success": True, "post_id": post_id}

    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"Ошибка подключения к VK: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}




# ============================================================
# API-маршруты (AJAX)
# ============================================================
@app.route("/api/favorites", methods=["GET"])
def get_favorites():
    """Возвращает список избранных постов."""
    favs = load_json(FAVS_FILE)
    # Новые сверху
    return jsonify(list(reversed(favs)))


@app.route("/api/favorites", methods=["POST"])
def add_favorite():
    """Добавляет пост в избранное."""
    data = request.json
    favs = load_json(FAVS_FILE)
    fav = {
        "id": str(uuid.uuid4())[:8],
        "text": data.get("text", ""),
        "date": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "url": data.get("url", ""),
        "mood": data.get("mood", ""),
    }
    favs.append(fav)
    save_json(FAVS_FILE, favs)
    return jsonify({"success": True, "id": fav["id"]})


@app.route("/api/favorites/<fav_id>", methods=["DELETE"])
def delete_favorite(fav_id):
    """Удаляет пост из избранного."""
    favs = load_json(FAVS_FILE)
    favs = [f for f in favs if f["id"] != fav_id]
    save_json(FAVS_FILE, favs)
    return jsonify({"success": True})


@app.route("/api/favorites/<fav_id>", methods=["PUT"])
def update_favorite(fav_id):
    """Обновляет текст избранного поста."""
    data = request.json
    favs = load_json(FAVS_FILE)
    for fav in favs:
        if fav["id"] == fav_id:
            fav["text"] = data.get("text", fav["text"])
            save_json(FAVS_FILE, favs)
            return jsonify({"success": True})
    return jsonify({"success": False, "error": "Пост не найден"})


@app.route("/api/scheduled", methods=["GET"])
def get_scheduled():
    """Возвращает список отложенных постов."""
    scheduled = load_json(SCHEDULED_FILE)
    return jsonify(list(reversed(scheduled)))


@app.route("/api/scheduled", methods=["POST"])
def add_scheduled():
    """Добавляет пост в расписание — сразу отправляет в VK как отложенный."""
    data = request.json
    schedule_date = data.get("schedule_date", "")
    text = data.get("text", "")

    # Конвертируем дату в Unix timestamp для VK API
    publish_time = int(datetime.strptime(schedule_date, "%Y-%m-%dT%H:%M").timestamp())

    # Сразу отправляем в VK как отложенный пост (VK сам опубликует в нужное время)
    vk_result = publish_to_vk(text, is_scheduled=True, schedule_date=schedule_date)

    if not vk_result["success"]:
        return jsonify({"success": False, "error": vk_result.get("error", "Ошибка публикации")})

    scheduled = load_json(SCHEDULED_FILE)
    post = {
        "id": str(uuid.uuid4())[:8],
        "text": text,
        "schedule_date": schedule_date,
        "url": data.get("url", ""),
        "mood": data.get("mood", ""),
        "published": False,  # VK опубликует сам — обновим при следующей проверке
        "vk_post_id": vk_result.get("post_id"),
        "created_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
    }
    scheduled.append(post)
    save_json(SCHEDULED_FILE, scheduled)
    return jsonify({"success": True, "id": post["id"]})


@app.route("/api/scheduled/<post_id>", methods=["DELETE"])
def delete_scheduled(post_id):
    """Удаляет отложенный пост из расписания."""
    scheduled = load_json(SCHEDULED_FILE)
    scheduled = [p for p in scheduled if p["id"] != post_id]
    save_json(SCHEDULED_FILE, scheduled)
    return jsonify({"success": True})


@app.route("/api/scheduled/<post_id>", methods=["PUT"])
def update_scheduled(post_id):
    """Обновляет текст отложенного поста."""
    data = request.json
    scheduled = load_json(SCHEDULED_FILE)
    for post in scheduled:
        if post["id"] == post_id:
            post["text"] = data.get("text", post["text"])
            save_json(SCHEDULED_FILE, scheduled)
            return jsonify({"success": True})
    return jsonify({"success": False, "error": "Пост не найден"})


@app.route("/api/publish", methods=["POST"])
def api_publish():
    """Публикует пост в VK прямо сейчас (AJAX)."""
    data = request.json
    text = data.get("text", "")
    if not text:
        return jsonify({"success": False, "error": "Текст поста пустой"})
    result = publish_to_vk(text)
    return jsonify(result)


@app.route("/api/vk-status", methods=["GET"])
def vk_status():
    """Проверяет, настроен ли VK."""
    is_configured = bool(VK_ACCESS_TOKEN and VK_GROUP_ID)
    return jsonify({"configured": is_configured})


# ============================================================
# МАРШРУТЫ (routes) — основные страницы
# ============================================================
@app.route("/", methods=["GET", "POST"])
def index():
    """Главная страница: форма с URL и результат генерации."""
    generated_post = None
    error = None
    submitted_url = ""
    vk_configured = bool(VK_ACCESS_TOKEN and VK_GROUP_ID)

    if request.method == "POST":
        submitted_url = request.form.get("product_url", "").strip()
        mood = request.form.get("mood", DEFAULT_CONFIG["mood"])
        length = request.form.get("length", DEFAULT_CONFIG["length"])

        if not submitted_url:
            error = "Вставьте ссылку на товар!"
        else:
            config = {
                **DEFAULT_CONFIG,
                "mood": mood,
                "length": length,
            }
            generated_post = generate_post_with_ai(submitted_url, config)

    favs = load_json(FAVS_FILE)
    scheduled = load_json(SCHEDULED_FILE)

    return render_template(
        "index.html",
        generated_post=generated_post,
        error=error,
        submitted_url=submitted_url,
        config=DEFAULT_CONFIG,
        vk_configured=vk_configured,
        favorites=list(reversed(favs)),
        scheduled=list(reversed(scheduled)),
    )


# if __name__ == "__main__":
#     # Запуск сервера на localhost:5555
#     app.run(debug=True, host="127.0.0.1", port=5555)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
