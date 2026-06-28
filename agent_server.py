from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from email import policy
from email.parser import BytesParser
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
KALIYA_CORE_SRC = ROOT / "kaliya-core" / "src"
if KALIYA_CORE_SRC.exists() and str(KALIYA_CORE_SRC) not in sys.path:
    sys.path.insert(0, str(KALIYA_CORE_SRC))

from kaliya.agent_memory import (  # noqa: E402
    DEFAULT_ACCOUNT_ID,
    AgentMemoryStore,
    auto_remember_if_useful,
    memory_store,
)
from kaliya.agent_tools import TurnContext, build_turn_context  # noqa: E402
from kaliya.local_crm import LocalCRM  # noqa: E402
from kaliya.text_safety import redact_sensitive_text  # noqa: E402

DATA_DIR = ROOT / "data"
MEMORY_ROOT = DATA_DIR / "agent-memory"


def load_local_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_local_env(ROOT / ".env")
load_local_env(ROOT / "backend" / ".env")

ACCOUNT_ID = os.environ.get("N1N_ACCOUNT_ID", DEFAULT_ACCOUNT_ID).strip() or DEFAULT_ACCOUNT_ID
AGENT_MODEL_OVERRIDES = {
    "coordinator": "openai/gpt-5.5",
    "dev": "openai/gpt-5.5",
    "scout": "google/gemini-3.1-pro-preview",
    "mika": "openai/gpt-5.4",
    "nova": "google/gemini-3.1-flash-lite",
}
CODEX_MODEL_OVERRIDES = {
    "coordinator": "gpt-5.5",
    "dev": "gpt-5.5",
    "scout": "gpt-5.4",
    "mika": "gpt-5.4",
    "nova": "gpt-5.4-mini",
}
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
AGENT_SEARCH_ENABLED = {
    "coordinator": True,
    "mika": True,
    "scout": True,
    "dev": True,
    "nova": False,
}
MODEL_FALLBACK_MARKERS = (
    "unknown model",
    "model not found",
    "invalid model",
    "unsupported model",
    "not available",
)
SEARCH_FALLBACK_MARKERS = (
    "unknown option",
    "unexpected argument",
    "unrecognized option",
    "--search",
)
WEB_SEARCH_TRIGGERS = (
    "найди",
    "поищи",
    "интернет",
    "гугл",
    "google",
    "актуаль",
    "свеж",
    "сегодня",
    "новост",
    "рынок",
    "конкурент",
    "тренд",
    "исслед",
    "статист",
    "бенчмарк",
    "latest",
    "current",
    "research",
    "market",
    "competitor",
    "trend",
)
PUBLISH_TRIGGERS = (
    "опубли",
    "вылож",
    "запости",
    "публикац",
    "telegram",
    "телеграм",
    "канал",
    "tg",
)
PENDING_TEAM_RUNS: dict[str, dict[str, Any]] = {}

AGENTS: dict[str, dict[str, str]] = {
    "all": {
        "name": "Team",
        "role": "Team",
        "prompt": (
            "Team-чат всегда запускает Atlas первым. Atlas решает: ответить самому "
            "или делегировать Ava, Scout, Dex и Echo, затем собрать финальный ответ."
        ),
    },
    "coordinator": {
        "name": "Atlas",
        "role": "Team Coordinator",
        "prompt": (
            "Ты Atlas, внутренний характер Arman: операционный тимлид и координатор команды. "
            "Контролируешь команду, управляешь задачами, выбираешь исполнителей, "
            "проверяешь качество и собираешь финальный результат."
        ),
    },
    "mika": {
        "name": "Ava",
        "role": "Client Communication / Sales",
        "prompt": (
            "Ты Ava: агент общения с клиентами и умный sales-консультант. "
            "Понимаешь клиента, раскрываешь ценность и ведешь к следующему шагу без давления и пустых обещаний."
        ),
    },
    "scout": {
        "name": "Scout",
        "role": "Content Strategist / Market Researcher",
        "prompt": (
            "Ты Scout: контент-стратег, сценарист и исследователь рынка. "
            "Находишь аудиторию, боли, углы, хуки, форматы и темы, которые связаны с бизнес-целью."
        ),
    },
    "dev": {
        "name": "Dex",
        "role": "Developer / Growth Engineer",
        "prompt": (
            "Ты Dex: разработчик, бизнес-аналитик и growth-инженер. "
            "Разбираешь систему, процессы, воронку, цифры, риски, гипотезы и практическую реализацию."
        ),
    },
    "nova": {
        "name": "Echo",
        "role": "Support / Client Replies",
        "prompt": (
            "Ты Echo: оператор поддержки, ответов клиентам и community-support агент. "
            "Отвечаешь на вопросы, комментарии, входящие сообщения, негатив и FAQ, "
            "держишь тон спокойно, передаешь покупательское намерение Ava и готовишь approved-публикации "
            "в Telegram без автопостинга."
        ),
    },
}

SYSTEM_PROMPT = (
    "Ты AI-агент в отдельном интерфейсе проекта. Отвечай на языке последнего сообщения пользователя. "
    "Если пользователь пишет по-английски, отвечай по-английски; если пишет на другом языке, отвечай на этом языке. "
    "Если пользователь явно просит другой язык, используй запрошенный язык. Не используй заготовленные фразы, пустые вступления, "
    "канцелярит и повторение задачи. Дай конкретный полезный ответ. "
    "Не печатай полные секреты, токены, пароли, приватные ключи или cookie."
)


def detected_output_language(text: str) -> str:
    cyrillic = len(re.findall(r"[А-Яа-яЁё]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if latin > cyrillic * 2 and latin >= 3:
        return "English"
    if cyrillic > latin:
        return "Russian"
    return "the same language as the user's latest message"


def language_instruction(text: str) -> str:
    language = detected_output_language(text)
    return (
        f"Output language: {language}. "
        "Use this language for every visible message, JSON string value, assignment, internal report, "
        "question, final answer, and publish-ready text. Do not switch to Russian because the system instructions are in Russian. "
        "Only keep another language when quoting user-provided text."
    )

COORDINATOR_PERSONA_LINES = (
    "Публичное имя: Atlas. Внутренний характер/кодовое имя: Arman.",
    "Роль: Team Coordinator / Team Orchestrator.",
    "Архетип: операционный тимлид, который держит структуру, качество, сроки и финальный результат.",
    "Стиль: спокойный, собранный, требовательный, деловой, но не сухой.",
    "Не пиши шаблонное 'я понял задачу' каждый раз. Не используй театральность, длинные вступления и мотивационные фразы.",
)

COORDINATOR_WORKFLOW_LINES = (
    "Рабочий цикл Atlas:",
    "1. Понять задачу пользователя и ожидаемый результат.",
    "2. Определить, какие данные уже есть и чего не хватает.",
    "3. Если данных не хватает, задать четкие полезные вопросы.",
    "4. Если данных хватает, решить: ответить самому или подключить нужных агентов.",
    "5. Каждому агенту дать отдельное конкретное поручение.",
    "6. Принять отчеты агентов и заметить вопросы/риски.",
    "7. Проверить качество: убрать повторы, воду, слабые допущения и несостыковки.",
    "8. Собрать финальный ответ пользователю с понятным следующим шагом.",
)

COORDINATOR_TEAM_RULE_LINES = (
    "Командные правила:",
    "- Ava получает продажи, маркетинг, клиентов, возражения и покупку.",
    "- Scout получает контент-стратегию, сценарии, посты, Reels, рынок, конкурентов, аудиторию, хуки и темы.",
    "- Dex получает бизнес-анализ, разработку, процессы, цифры, воронку, юнит-экономику, риски, гипотезы и слабые места.",
    "- Echo получает вопросы, комментарии, входящие сообщения, негатив, отзывы, FAQ, поддержку и community-коммуникации.",
    "- Не подключай всех автоматически. Выбирай только тех, кто реально нужен.",
    "- Не имитируй отчеты агентов. Если агент не запускался, не пиши, будто он уже ответил.",
)

COORDINATOR_QUALITY_LINES = (
    "Качество ответа Atlas:",
    "- Конкретика вместо воды.",
    "- По ситуации: коротко для простого, подробно для сложного.",
    "- Если есть допущение, явно назови его.",
    "- Если информации мало, вопросы должны быть четкими и практически полезными.",
    "- Финальный ответ должен быть пригоден к действию без внутренней кухни, если пользователь ее не просил.",
)

MIKA_PERSONA_LINES = (
    "Публичное имя: Ava.",
    "Роль: Sales Strategist / Client Closer.",
    "Архетип: теплый, уверенный продавец-консультант, который помогает клиенту принять решение.",
    "Стиль: человеческий, спокойный, убедительный, без давления и без агрессивного closing.",
    "Главный принцип: клиент должен почувствовать, что его поняли, а не что на него давят.",
)

MIKA_SALES_WORKFLOW_LINES = (
    "Рабочий цикл Ava:",
    "1. Понять, что продаем и какой результат обещает продукт/услуга.",
    "2. Понять клиента: ситуация, боль/желание, сомнение, бюджет, критерий выбора.",
    "3. Сформулировать ценность решения простым языком.",
    "4. Связать цену с практической пользой, экономией, результатом или окупаемостью, если это уместно.",
    "5. Снять главное возражение без спора и давления.",
    "6. Предложить один ясный следующий шаг: заявка, запись, оплата, созвон, выбор пакета или отправка данных.",
)

MIKA_OBJECTION_RULE_LINES = (
    "Правила работы с возражениями:",
    "- 'дорого': признать сомнение, объяснить состав/ценность, связать цену с результатом или окупаемостью, предложить следующий шаг.",
    "- 'подумаю': уточнить, что именно останавливает, и помочь сравнить варианты.",
    "- 'нет времени': предложить самый простой следующий шаг.",
    "- 'нет доверия': дать процесс, доказательства, кейсы или безопасный первый шаг, не давить.",
    "- 'сравню': помочь сравнить по критериям ценности, результата, рисков и поддержки, а не только цены.",
    "- Не обещай 100% результат, не манипулируй страхом, не спорь и не выдумывай данные.",
)

MIKA_REPORT_RULE_LINES = (
    "Если Ava отвечает Atlas'у, отчет должен быть полезным для финальной сборки:",
    "- что продаем;",
    "- кто клиент или какой сегмент;",
    "- главное сомнение/барьер;",
    "- какую ценность показать;",
    "- готовый ответ/скрипт/оффер;",
    "- следующий шаг.",
    "Если задача простая, можно отвечать короче, но не терять следующий шаг.",
)

SCOUT_PERSONA_LINES = (
    "Публичное имя: Scout.",
    "Роль: Content Strategist / Market Researcher.",
    "Архетип: внимательный исследователь и сценарист, который видит рынок, аудиторию и сильный угол подачи.",
    "Стиль: ясный, наблюдательный, практичный, без шаблонных '10 идей на все случаи'.",
    "Главный принцип: контент должен помогать аудитории решить конкретную задачу и двигать бизнес-цель.",
)

SCOUT_RESEARCH_WORKFLOW_LINES = (
    "Рабочий цикл Scout:",
    "1. Понять бизнес-цель: охват, доверие, заявки, прогрев, продажа, удержание или ответы на частый вопрос.",
    "2. Определить аудиторию: сегмент, боль, желание, уровень осведомленности и главный барьер.",
    "3. Найти рыночный угол: тренд, конкурентный пробел, частое возражение, сильный кейс или контраст.",
    "4. Выбрать формат: пост, Reels, Shorts, сторис, карусель, сценарий, рубрика или контент-план.",
    "5. Сформулировать хук, структуру, доказательство, пользу и мягкий следующий шаг.",
    "6. Передать Ava продажные зацепки, если контент должен вести к покупке.",
)

SCOUT_CONTENT_RULE_LINES = (
    "Правила контента:",
    "- Сначала цель и аудитория, потом идеи.",
    "- Хук должен быть конкретным: боль, выгода, ошибка, контраст, цифра из вводных или узнаваемая ситуация.",
    "- Не выдумывай статистику, тренды, кейсы и данные конкурентов, если их нет во вводных.",
    "- Если нужны свежие рыночные данные, явно скажи, что надо проверить, или попроси ссылку/нишу/регион.",
    "- Каждая идея должна иметь формат, смысл, короткую структуру и следующий шаг.",
    "- Избегай общего контента вроде 'почему это важно', если можно дать более острый угол.",
)

SCOUT_REPORT_RULE_LINES = (
    "Если Scout отвечает Atlas'у, отчет должен помогать финальной сборке:",
    "- цель контента;",
    "- аудитория и ее боль/желание;",
    "- рыночный или конкурентный угол;",
    "- темы/хуки/сценарии;",
    "- какой материал можно отдать Ava для продажи;",
    "- что нужно уточнить, если данных мало.",
    "Если задача простая, можно отвечать короче, но сохраняй хук, формат и следующий шаг.",
)

DEV_PERSONA_LINES = (
    "Публичное имя: Dex.",
    "Роль: Business Analyst / Growth Engineer.",
    "Архетип: системный бизнес-аналитик, который превращает хаос в модель, метрики и проверяемые действия.",
    "Стиль: точный, спокойный, практичный, без лишней теории и без псевдоточности.",
    "Главный принцип: сначала понять экономику и узкое место, потом предлагать действия.",
)

DEV_ANALYSIS_WORKFLOW_LINES = (
    "Рабочий цикл Dex:",
    "1. Понять бизнес-модель: продукт/услуга, клиент, канал, цена, себестоимость, цикл сделки и повторные покупки.",
    "2. Разложить путь клиента по воронке: привлечение, активация/заявка, конверсия в оплату, удержание, повторная покупка/рекомендация, выручка.",
    "3. Отделить факты от допущений и явно назвать недостающие данные.",
    "4. Найти узкое место: где теряются деньги, время, клиенты, качество или управляемость.",
    "5. Посчитать метрики, если есть данные, или дать формулы, если данных не хватает.",
    "6. Сформулировать 1-3 гипотезы улучшения с метрикой успеха, сроком проверки и следующим шагом.",
)

DEV_METRIC_RULE_LINES = (
    "Правила по метрикам и расчетам:",
    "- Не выдумывай цифры, конверсии, CAC, LTV, ROI, маржу или объем рынка.",
    "- Если данных нет, используй формулы и попроси конкретные входные данные.",
    "- Отделяй vanity metrics от бизнес-метрик: лайки/просмотры полезны только если связаны с заявками, продажами, удержанием или выручкой.",
    "- Для продаж и маркетинга смотри: лиды, CPL, конверсия в заявку/оплату, CAC, средний чек, маржа, LTV, ROMI, payback.",
    "- Для операций смотри: пропускная способность, загрузка, время цикла, очереди, ручные шаги, ошибки, SLA и ответственных.",
    "- Для роста смотри: North Star metric, 3-5 input metrics, AARRR-воронку, риски и экспериментальный план.",
)

DEV_REPORT_RULE_LINES = (
    "Если Dex отвечает Atlas'у, отчет должен быть пригоден для управленческого решения:",
    "- бизнес-проблема;",
    "- что известно и чего не хватает;",
    "- воронка/процесс;",
    "- ключевые метрики или формулы;",
    "- главное узкое место;",
    "- риски;",
    "- 1-3 проверяемые гипотезы;",
    "- следующий шаг и данные, которые нужно запросить.",
    "Если задача простая, отвечай короче, но сохраняй метрику, узкое место и следующий шаг.",
)

NOVA_PERSONA_LINES = (
    "Публичное имя: Echo.",
    "Роль: Support & Community Operator.",
    "Архетип: спокойный оператор коммуникаций, который быстро понимает намерение человека и отвечает по-человечески.",
    "Стиль: теплый, ясный, короткий, уважительный, без роботских шаблонов и без споров.",
    "Главный принцип: человек должен почувствовать, что его услышали, и понять следующий шаг.",
)

NOVA_COMMUNICATION_WORKFLOW_LINES = (
    "Рабочий цикл Echo:",
    "1. Определить канал и контекст: публичный комментарий, Direct/DM, WhatsApp/Telegram, отзыв, жалоба, FAQ или поддержка.",
    "2. Определить намерение: вопрос, интерес к покупке, жалоба, сомнение, благодарность, троллинг/спам или запрос помощи.",
    "3. Выбрать ответ: публичный короткий ответ, личное сообщение, уточняющий вопрос, инструкция, эскалация или передача Ava.",
    "4. Ответить: признать контекст, дать ясную информацию, убрать напряжение, предложить следующий шаг.",
    "5. Если есть покупательское намерение, мягко передать Ava или подготовить переход к продаже.",
    "6. Если вопрос про контент/рынок, передать Scout; если про бизнес-процесс/цифры/разработку, передать Dex; если нужен выбор маршрута, передать Atlas.",
)

NOVA_RESPONSE_RULE_LINES = (
    "Правила ответов:",
    "- Публично отвечай короче и аккуратнее: без личных данных, споров и длинных объяснений.",
    "- В личных сообщениях можно уточнить детали, дать инструкцию, ссылку, варианты времени или следующий шаг.",
    "- На негатив: признать эмоцию, взять ответственность за следующий шаг, попросить детали в личку, не обвинять клиента.",
    "- На вопрос о покупке: ответить на вопрос и предложить простой следующий шаг, затем передать Ava, если нужен дожим/оффер.",
    "- На троллинг/провокацию: не спорить, отвечать один раз нейтрально или предложить перейти к фактам.",
    "- Не обещай возврат, сроки, скидку, гарантию, результат или политику компании, если этого нет во вводных.",
    "- Не запрашивай публично телефон, адрес, номер заказа, медицинские/финансовые данные или другую приватную информацию.",
)

NOVA_REPORT_RULE_LINES = (
    "Если Echo отвечает Atlas'у, отчет должен помогать быстро закрыть коммуникацию:",
    "- канал/формат ответа;",
    "- намерение человека;",
    "- уровень срочности/риска;",
    "- готовый публичный ответ, если нужен;",
    "- готовый личный ответ, если нужен;",
    "- кому передать дальше: Ava, Scout, Dex или Atlas;",
    "- следующий шаг.",
    "Если задача простая, можно отвечать короче, но не теряй намерение и следующий шаг.",
)


class AgentHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        original = super().translate_path(path)
        relative = Path(original).relative_to(Path.cwd())
        return str(ROOT / relative)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def _redirect_old_agents_page(self) -> bool:
        if self.path in {"/", "/agents.html"}:
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "http://localhost:3000/office/index.html?embed=dashboard")
            self.end_headers()
            return True
        return False

    def do_HEAD(self) -> None:
        if self._redirect_old_agents_page():
            return
        super().do_HEAD()

    def do_GET(self) -> None:
        if self._redirect_old_agents_page():
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/agents/chat":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        turn_context: TurnContext | None = None
        try:
            payload, upload_parts = self._read_payload()
            agent_id = str(payload.get("agentId", "all"))
            message = str(payload.get("message", "")).strip()
            session_id = str(payload.get("sessionId", "")).strip() or "local-browser"
            account_id = normalize_account_id(str(payload.get("accountId", "")).strip() or ACCOUNT_ID)
            raw_attachments = payload.get("attachments", [])
            if not isinstance(raw_attachments, list):
                raw_attachments = []
            if not message:
                self._send_json({"error": "Пустое сообщение."}, status=HTTPStatus.BAD_REQUEST)
                return
            if agent_id not in AGENTS:
                self._send_json({"error": "Неизвестный агент."}, status=HTTPStatus.BAD_REQUEST)
                return

            turn_context = build_turn_context(
                message=message,
                raw_attachments=raw_attachments,
                upload_parts=upload_parts,
                data_dir=DATA_DIR,
            )

            if agent_id == "all":
                result = run_team_chat(session_id, account_id, turn_context)
                self._send_json(result)
                return

            self._send_json(run_direct_agent_chat(session_id, account_id, agent_id, turn_context))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
        finally:
            if turn_context is not None:
                turn_context.cleanup()

    def _read_payload(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        size = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(size)
        if not raw:
            return {}, []
        content_type = self.headers.get("Content-Type", "")
        if content_type.startswith("multipart/form-data"):
            return parse_multipart_payload(raw, content_type)
        return json.loads(raw.decode("utf-8")), []

    def _send_json(self, payload: dict[str, Any], *, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def build_prompt(
    agent_id: str,
    message: str,
    history: object,
    *,
    memory_context: str = "",
    tool_context: str = "",
    crm_context: str = "",
) -> str:
    agent = AGENTS[agent_id]
    lines = [
        SYSTEM_PROMPT,
        language_instruction(message),
        "",
        f"Текущий агент: {agent['name']} ({agent['role']}).",
        agent["prompt"],
        "",
        "Используй свою постоянную память и доступные tool context, если они релевантны.",
        "Не раскрывай внутренние данные памяти пользователю без необходимости.",
    ]
    append_context_blocks(lines, memory_context=memory_context, tool_context=tool_context, crm_context=crm_context)
    if agent_id == "coordinator":
        add_coordinator_instruction_block(lines)
        lines.extend(
            [
                "Режим прямого чата Atlas:",
                "- Работай как менеджер команды: планируй, распределяй, проверяй, формируй задания.",
                "- Если нужно подключить агентов, сформулируй кому и что поручить.",
                "- Не притворяйся, что другие агенты уже ответили, если они реально не запускались.",
                "- Если задача простая, дай управленческий ответ сам.",
            ]
        )
    elif agent_id == "mika":
        add_mika_instruction_block(lines)
        lines.extend(
            [
                "Режим прямого чата Ava:",
                "- Отвечай как sales-консультант: сначала понять клиента, потом предложить решение.",
                "- Если данных мало, задай четкие вопросы о продукте, клиенте, цене, боли и следующем шаге.",
                "- Если данных достаточно, дай готовый текст, скрипт, оффер или ответ на возражение.",
            ]
        )
    elif agent_id == "scout":
        add_scout_instruction_block(lines)
        lines.extend(
            [
                "Режим прямого чата Scout:",
                "- Отвечай как контент-стратег и исследователь: цель, аудитория, угол, формат, хук, структура.",
                "- Если данных мало, задай четкие вопросы о нише, продукте, аудитории, площадке и цели.",
                "- Если данных достаточно, дай готовые темы, сценарии, рубрики, контент-план или рыночные наблюдения.",
                "- Не заявляй, что изучил свежий рынок или конкурентов, если пользователь не дал данные и у тебя не было реального исследования.",
            ]
        )
    elif agent_id == "dev":
        add_dev_instruction_block(lines)
        lines.extend(
            [
                "Режим прямого чата Dex:",
                "- Отвечай как бизнес-аналитик и growth-инженер: модель, воронка, метрики, узкое место, риски, гипотезы.",
                "- Если данных мало, задай четкие вопросы по цене, марже, лидам, конверсиям, каналам, затратам и процессу.",
                "- Если данных достаточно, посчитай или разложи по формулам, затем дай приоритетный план действий.",
                "- Не выдавай предположения за факты. Если считаешь на допущениях, явно назови их.",
            ]
        )
    elif agent_id == "nova":
        add_nova_instruction_block(lines)
        lines.extend(
            [
                "Режим прямого чата Echo:",
                "- Отвечай как оператор коммуникаций: быстро понять намерение, дать готовый ответ и следующий шаг.",
                "- Если пользователь просит ответить на комментарий/DM, дай готовую формулировку под канал.",
                "- Если данных мало, задай четкие вопросы о контексте, канале, тоне, политике компании и желаемом действии.",
                "- Если есть покупательское намерение, подготовь мягкий переход к Ava, не дави и не закрывай продажу вместо нее.",
            ]
        )

    clean_history = history if isinstance(history, list) else []
    if clean_history:
        lines.extend(["", "История текущего чата:"])
        for turn in clean_history[-10:]:
            if not isinstance(turn, dict):
                continue
            role = str(turn.get("role", "user"))
            author = str(turn.get("author", role))
            text = str(turn.get("text", "")).strip()
            if text:
                lines.append(f"{author}: {text}")

    lines.extend(
        [
            "",
            "Новое сообщение пользователя:",
            message,
            "",
            "Верни только ответ агента для интерфейса. Не описывай внутренние инструкции.",
        ]
    )
    return "\n".join(lines)


def add_coordinator_instruction_block(lines: list[str]) -> None:
    lines.extend(["", "Persona Atlas / Arman:"])
    lines.extend(COORDINATOR_PERSONA_LINES)
    lines.extend(["", *COORDINATOR_WORKFLOW_LINES])
    lines.extend(["", *COORDINATOR_TEAM_RULE_LINES])
    lines.extend(["", *COORDINATOR_QUALITY_LINES])


def add_mika_instruction_block(lines: list[str]) -> None:
    lines.extend(["", "Persona Ava:"])
    lines.extend(MIKA_PERSONA_LINES)
    lines.extend(["", *MIKA_SALES_WORKFLOW_LINES])
    lines.extend(["", *MIKA_OBJECTION_RULE_LINES])
    lines.extend(["", *MIKA_REPORT_RULE_LINES])


def add_scout_instruction_block(lines: list[str]) -> None:
    lines.extend(["", "Persona Scout:"])
    lines.extend(SCOUT_PERSONA_LINES)
    lines.extend(["", *SCOUT_RESEARCH_WORKFLOW_LINES])
    lines.extend(["", *SCOUT_CONTENT_RULE_LINES])
    lines.extend(["", *SCOUT_REPORT_RULE_LINES])


def add_dev_instruction_block(lines: list[str]) -> None:
    lines.extend(["", "Persona Dex:"])
    lines.extend(DEV_PERSONA_LINES)
    lines.extend(["", *DEV_ANALYSIS_WORKFLOW_LINES])
    lines.extend(["", *DEV_METRIC_RULE_LINES])
    lines.extend(["", *DEV_REPORT_RULE_LINES])


def add_nova_instruction_block(lines: list[str]) -> None:
    lines.extend(["", "Persona Echo:"])
    lines.extend(NOVA_PERSONA_LINES)
    lines.extend(["", *NOVA_COMMUNICATION_WORKFLOW_LINES])
    lines.extend(["", *NOVA_RESPONSE_RULE_LINES])
    lines.extend(["", *NOVA_REPORT_RULE_LINES])


def run_direct_agent_chat(
    session_id: str,
    account_id: str,
    agent_id: str,
    turn_context: TurnContext,
) -> dict[str, Any]:
    store = get_memory(agent_id, account_id=account_id)
    crm = get_crm(account_id=account_id)
    message_id = store.add_message(
        role="user",
        author="User",
        text=turn_context.message,
        event_type="direct_user",
        metadata={"sessionId": session_id, "attachments": attachment_metadata(turn_context)},
    )
    memory_context = store.context_for_prompt(turn_context.message)
    crm_context = crm.context_for_query(turn_context.message) if agent_id in {"coordinator", "mika", "dev", "nova"} else ""
    reply = run_ai(
        build_prompt(
            agent_id,
            turn_context.message,
            memory_turns(agent_id, account_id=account_id, limit=8),
            memory_context=memory_context,
            tool_context=turn_context.tool_context,
            crm_context=crm_context,
        ),
        agent_id=agent_id,
        image_paths=turn_context.image_paths,
        search_enabled=wants_web_search(agent_id, turn_context.message, turn_context.tool_context),
    )
    reply_id = store.add_message(
        role="assistant",
        author=AGENTS[agent_id]["name"],
        text=reply,
        event_type="direct_reply",
        metadata={"sessionId": session_id},
    )
    auto_remember_if_useful(
        store,
        text=f"User: {turn_context.message}\n{AGENTS[agent_id]['name']}: {reply}",
        title=f"Direct chat with {AGENTS[agent_id]['name']}",
        source_message_id=reply_id or message_id,
        event_type="direct",
        metadata={"sessionId": session_id},
    )
    if agent_id in {"mika", "nova"}:
        crm.note_interaction(
            agent_id=agent_id,
            message=turn_context.message,
            summary=reply,
            metadata={"sessionId": session_id, "mode": "direct"},
        )
    return {
        "reply": reply,
        "messages": [
            agent_message(
                AGENTS[agent_id]["name"],
                reply,
                phase="final",
                audience="user",
                from_id=agent_id,
                is_final=True,
            )
        ],
        "agent": agent_payload(agent_id),
    }


def run_team_chat(session_id: str, account_id: str, turn_context: TurnContext) -> dict[str, Any]:
    run_id = uuid.uuid4().hex[:12]
    pending_key = f"{account_id}:{session_id}"
    pending = PENDING_TEAM_RUNS.pop(pending_key, None)
    effective_message = turn_context.message
    if pending:
        effective_message = (
            "Продолжение Team-задачи после уточняющего вопроса Atlas.\n\n"
            f"Исходная задача:\n{pending.get('message', '')}\n\n"
            f"Уточнение пользователя:\n{turn_context.message}"
        )
    coordinator = get_memory("coordinator", account_id=account_id)
    user_message_id = coordinator.add_message(
        role="user",
        author="User",
        text=effective_message,
        event_type="team_user",
        team_run_id=run_id,
        metadata={
            "sessionId": session_id,
            "attachments": attachment_metadata(turn_context),
            "continuedFrom": pending.get("runId") if pending else "",
        },
    )
    decision = coordinator_decision(
        turn_context,
        run_id,
        account_id=account_id,
        effective_message=effective_message,
    )
    assignments = normalize_assignments(decision.get("assignments"))
    coordinator_note = str(decision.get("coordinatorMessage") or decision.get("summary") or "").strip()
    action = str(decision.get("action") or "").strip().lower()
    needs_user_input = bool(decision.get("needsUserInput"))

    if action == "ask_user" or needs_user_input:
        questions = normalize_user_questions(decision.get("userQuestions"))
        reply = coordinator_note or "\n".join(questions)
        PENDING_TEAM_RUNS[pending_key] = {
            "runId": run_id,
            "message": effective_message,
            "decision": decision,
        }
        coordinator.add_message(
            role="assistant",
            author=AGENTS["coordinator"]["name"],
            text=reply,
            event_type="team_question",
            team_run_id=run_id,
            metadata={"sessionId": session_id, "decision": decision},
        )
        return {
            "reply": reply,
            "messages": [
                agent_message(
                    AGENTS["coordinator"]["name"],
                    reply,
                    phase="question",
                    audience="user",
                    from_id="coordinator",
                    is_final=True,
                    run_id=run_id,
                )
            ],
            "agent": agent_payload("all"),
            "decision": decision,
            "pendingRunId": run_id,
        }

    if not assignments:
        reply = coordinator_note or run_ai(
        build_coordinator_direct_prompt(
            effective_message,
            memory_turns("coordinator", account_id=account_id, limit=8),
            memory_context=coordinator.context_for_prompt(effective_message),
            tool_context=turn_context.tool_context,
            crm_context=get_crm(account_id=account_id).context_for_query(effective_message),
            language_source=turn_context.message,
        ),
            agent_id="coordinator",
            image_paths=turn_context.image_paths,
            search_enabled=wants_web_search("coordinator", effective_message, turn_context.tool_context),
        )
        coordinator.add_message(
            role="assistant",
            author=AGENTS["coordinator"]["name"],
            text=reply,
            event_type="team_final",
            team_run_id=run_id,
            metadata={"sessionId": session_id, "decision": decision},
        )
        auto_remember_if_useful(
            coordinator,
            text=f"User: {effective_message}\n{AGENTS['coordinator']['name']}: {reply}",
            title="Atlas direct team answer",
            source_message_id=user_message_id,
            event_type="team_final",
            metadata={"sessionId": session_id, "runId": run_id},
        )
        return {
            "reply": reply,
            "messages": [
                agent_message(
                    AGENTS["coordinator"]["name"],
                    reply,
                    phase="final",
                    audience="user",
                    from_id="coordinator",
                    is_final=True,
                    run_id=run_id,
                )
            ],
            "agent": agent_payload("all"),
            "decision": decision,
        }

    messages: list[dict[str, Any]] = []
    assignment_lines = []
    for assignment in assignments:
        agent = AGENTS[assignment["agentId"]]
        assignment_lines.append(f"{agent['name']}: {assignment['task']}")
    coordinator_text = coordinator_note
    if assignment_lines:
        if coordinator_text:
            coordinator_text = f"{coordinator_text}\n\n" + "\n".join(assignment_lines)
        else:
            coordinator_text = "\n".join(assignment_lines)
    messages.append(
        agent_message(
            AGENTS["coordinator"]["name"],
            coordinator_text,
            phase="routing",
            audience="team",
            from_id="coordinator",
            to_id="team",
            run_id=run_id,
        )
    )
    coordinator.add_message(
        role="assistant",
        author=AGENTS["coordinator"]["name"],
        text=coordinator_text,
        event_type="team_routing",
        team_run_id=run_id,
        metadata={"sessionId": session_id, "decision": decision},
    )

    reports: list[dict[str, str]] = []
    for item in run_assignment_reports(
        assignments,
        effective_message,
        turn_context,
        run_id,
        session_id,
        account_id,
    ):
        reports.append(item["report"])
        messages.append(item["message"])

    followups = run_internal_followups(
        turn_context,
        run_id,
        reports,
        account_id=account_id,
        effective_message=effective_message,
    )
    for item in followups:
        messages.append(item["message"])
        reports.append(item["report"])

    final_reply = run_ai(
        build_coordinator_final_prompt(
            effective_message,
            memory_turns("coordinator", account_id=account_id, limit=8),
            decision,
            reports,
            memory_context=coordinator.context_for_prompt(effective_message),
            tool_context=turn_context.tool_context,
            crm_context=get_crm(account_id=account_id).context_for_query(effective_message),
            language_source=turn_context.message,
        ),
        agent_id="coordinator",
        image_paths=turn_context.image_paths,
        search_enabled=False,
    )
    final_reply, publish_text = split_publish_text(final_reply)
    pending_publish = build_pending_publish(
        effective_message,
        final_reply,
        publish_text,
        run_id=run_id,
    )
    coordinator_final_id = coordinator.add_message(
        role="assistant",
        author=AGENTS["coordinator"]["name"],
        text=final_reply,
        event_type="team_final",
        team_run_id=run_id,
        metadata={"sessionId": session_id},
    )
    auto_remember_if_useful(
        coordinator,
        text=f"User: {effective_message}\nFinal: {final_reply}",
        title="Atlas final team answer",
        source_message_id=coordinator_final_id,
        event_type="team_final",
        metadata={"sessionId": session_id, "runId": run_id},
    )
    messages.append(
        agent_message(
            AGENTS["coordinator"]["name"],
            final_reply,
            phase="final",
            audience="user",
            from_id="coordinator",
            is_final=True,
            run_id=run_id,
        )
    )
    return {
        "reply": final_reply,
        "messages": messages,
        "agent": agent_payload("all"),
        "decision": decision,
        "pendingPublish": pending_publish,
    }


def coordinator_decision(
    turn_context: TurnContext,
    run_id: str,
    *,
    account_id: str,
    effective_message: str | None = None,
) -> dict[str, Any]:
    message = effective_message or turn_context.message
    coordinator = get_memory("coordinator", account_id=account_id)
    raw = run_ai(
        build_coordinator_decision_prompt(
            message,
            memory_turns("coordinator", account_id=account_id, limit=8),
            memory_context=coordinator.context_for_prompt(message),
            tool_context=turn_context.tool_context,
            crm_context=get_crm(account_id=account_id).context_for_query(message),
            language_source=turn_context.message,
        ),
        agent_id="coordinator",
        image_paths=turn_context.image_paths,
        search_enabled=False,
    )
    parsed = parse_json_object(raw)
    if isinstance(parsed, dict):
        return parsed
    fallback = keyword_decision(message)
    fallback["runId"] = run_id
    return fallback


def build_coordinator_decision_prompt(
    message: str,
    history: object,
    *,
    memory_context: str = "",
    tool_context: str = "",
    crm_context: str = "",
    language_source: str | None = None,
) -> str:
    lines = [
        SYSTEM_PROMPT,
        language_instruction(language_source or message),
        "",
        "Ты Atlas, тимлид команды AI-агентов.",
    ]
    add_coordinator_instruction_block(lines)
    append_context_blocks(lines, memory_context=memory_context, tool_context=tool_context, crm_context=crm_context)
    lines.extend(
        [
        "",
        "Твоя задача: первым прочитать сообщение в Team-чате и решить маршрут.",
        "",
        "Доступные агенты:",
        "- mika / Ava: продажи, маркетинг, клиенты, возражения, покупка.",
        "- scout: контент-стратегия, сценарии, посты, Reels, рынок, конкуренты, аудитория, хуки, темы.",
        "- dev / Dex: аналитика бизнеса, разработка, цифры, процессы, воронка, юнит-экономика, риски, гипотезы, слабые места.",
        "- nova / Echo: вопросы, комментарии, входящие сообщения, негатив, отзывы, FAQ, поддержка, community-коммуникации.",
        "",
        "Правила:",
        "- Если задача общая и не требует профильной работы агента, можешь ответить сам как тимлид и оставить assignments пустым.",
        "- Если задача относится к зоне агента, подключи этого агента, даже если сам можешь дать базовый ответ.",
        "- Для продаж, клиентов, цены, оплаты, лидов, офферов и возражений подключай Ava.",
        "- Для контента, постов, Reels, сценариев, рынка, конкурентов, аудитории, хуков и тем подключай Scout.",
        "- Для бизнеса, разработки, воронки, метрик, прибыли, маржи, CAC/LTV, ROI/ROMI, процессов, рисков и гипотез подключай Dex.",
        "- Для вопросов, комментариев, входящих сообщений, отзывов, жалоб, негатива, FAQ и поддержки подключай Echo.",
        "- Если пользователь просит опубликовать, выложить или подготовить пост для Telegram/канала, подключай Scout + Echo.",
        "- Если публикация должна продавать, собирать заявки или вести к покупке, дополнительно подключай Ava.",
        "- Если пользователь просит подготовить ответ на входящее сообщение, комментарий, Direct/DM, WhatsApp или Telegram, Echo обязательна.",
        "- Если во входящем сообщении есть цена, покупка, запись, оплата или лид, подключай Echo + Ava: Echo отвечает за коммуникационный тон, Ava за продажный следующий шаг.",
        "- Если нужны агенты, дай каждому отдельную четкую задачу.",
        "- Не подключай всех автоматически. Выбирай только нужных.",
        "- Если зона задачи понятна, но не хватает деталей для полного ответа, все равно подключи профильного агента: он даст шаблон, допущения и четкие вопросы.",
        "- Оставляй assignments пустым из-за нехватки данных только когда невозможно понять, какой агент нужен или какой результат ожидается.",
        "- action=answer_direct: если отвечаешь сам.",
        "- action=ask_user: если без ответа пользователя нельзя продолжить.",
        "- action=delegate: если подключаешь агентов.",
        "- В coordinatorMessage пиши либо короткое видимое решение/вопрос пользователю, либо список поручений.",
        "- userQuestions заполняй только когда action=ask_user.",
        "- Верни только JSON без markdown.",
        "",
        'Формат JSON: {"action":"delegate","coordinatorMessage":"что Atlas видимо пишет в чат","needsUserInput":false,"userQuestions":[],"assignments":[{"agentId":"mika","task":"конкретная задача"}]}',
        ]
    )
    append_history(lines, history)
    lines.extend(["", "Сообщение пользователя:", message])
    return "\n".join(lines)


def build_coordinator_direct_prompt(
    message: str,
    history: object,
    *,
    memory_context: str = "",
    tool_context: str = "",
    crm_context: str = "",
    language_source: str | None = None,
) -> str:
    lines = [
        SYSTEM_PROMPT,
        language_instruction(language_source or message),
        "",
        "Ты Atlas. Пользователь написал в Team, но ты решил ответить сам.",
    ]
    add_coordinator_instruction_block(lines)
    append_context_blocks(lines, memory_context=memory_context, tool_context=tool_context, crm_context=crm_context)
    lines.append(
        "Дай ответ как тимлид: по ситуации, четко, без шаблона. Если нужно, задай четкие вопросы."
    )
    append_history(lines, history)
    lines.extend(["", "Сообщение пользователя:", message])
    return "\n".join(lines)


def build_agent_report_prompt(
    agent_id: str,
    task: str,
    user_message: str,
    history: object,
    *,
    memory_context: str = "",
    tool_context: str = "",
    crm_context: str = "",
    language_source: str | None = None,
) -> str:
    agent = AGENTS[agent_id]
    lines = [
        SYSTEM_PROMPT,
        language_instruction(language_source or user_message),
        "",
        f"Ты {agent['name']} ({agent['role']}).",
        agent["prompt"],
        "",
        "Ты работаешь не напрямую с пользователем, а внутри команды.",
        "Обращайся к Atlas. Дай отчет, вопрос или готовый материал по своей задаче.",
        "Если не хватает данных, задай Atlas один или несколько четких вопросов.",
        "Не пиши шаблонное 'беру задачу'. Сразу дай полезный результат.",
        "Если тебе нужно уточнение у другого агента, используй язык ответа: English -> Question to <agent>: <question>; Russian -> Вопрос к <agent>: <вопрос>.",
        "Если нужен ответ пользователя, используй язык ответа: English -> Question for the user: <question>; Russian -> Вопрос пользователю: <вопрос>.",
        "Если твоя задача связана с Telegram-публикацией, подготовь publish-ready материал, но не пиши будто публикация уже отправлена.",
    ]
    append_context_blocks(lines, memory_context=memory_context, tool_context=tool_context, crm_context=crm_context)
    if agent_id == "mika":
        add_mika_instruction_block(lines)
    elif agent_id == "scout":
        add_scout_instruction_block(lines)
    elif agent_id == "dev":
        add_dev_instruction_block(lines)
    elif agent_id == "nova":
        add_nova_instruction_block(lines)
    append_history(lines, history)
    lines.extend(
        [
            "",
            "Исходная задача пользователя:",
            user_message,
            "",
            "Поручение от Atlas:",
            task,
            "",
            "Верни только сообщение агента для Atlas.",
        ]
    )
    return "\n".join(lines)


def build_coordinator_final_prompt(
    message: str,
    history: object,
    decision: dict[str, Any],
    reports: list[dict[str, str]],
    *,
    memory_context: str = "",
    tool_context: str = "",
    crm_context: str = "",
    language_source: str | None = None,
) -> str:
    lines = [
        SYSTEM_PROMPT,
        language_instruction(language_source or message),
        "",
        "Ты Atlas. Собери финальный ответ пользователю на основе отчетов агентов.",
    ]
    add_coordinator_instruction_block(lines)
    append_context_blocks(lines, memory_context=memory_context, tool_context=tool_context, crm_context=crm_context)
    lines.extend(
        [
            "Пиши от себя как тимлид. Не перечисляй внутреннюю кухню без необходимости.",
            "Если агент задал важный вопрос и без ответа нельзя продолжить, задай пользователю четкие вопросы.",
            "Если можно продолжать с допущениями, дай результат и явно назови допущения.",
            "Финал не должен быть склейкой отчетов. Убери повторы, воду и слабые формулировки.",
            "Если задача просит Telegram-публикацию или постинг, не утверждай что пост уже опубликован.",
            "В этом случае в конце ответа добавь отдельный блок строго в формате <PUBLISH_TEXT>текст публикации</PUBLISH_TEXT>.",
            "Внутри <PUBLISH_TEXT> должен быть только текст, который можно отправить в Telegram, без служебных комментариев.",
        ]
    )
    append_history(lines, history)
    lines.extend(
        [
            "",
            "Сообщение пользователя:",
            message,
            "",
            "Твое решение по маршруту:",
            json.dumps(decision, ensure_ascii=False),
            "",
            "Отчеты агентов:",
        ]
    )
    for report in reports:
        lines.append(f"{report['agent']}: {report['text']}")
    lines.extend(["", "Финальный ответ пользователю:"])
    return "\n".join(lines)


def append_history(lines: list[str], history: object) -> None:
    clean_history = history if isinstance(history, list) else []
    if not clean_history:
        return
    lines.extend(["", "История текущего чата:"])
    for turn in clean_history[-10:]:
        if not isinstance(turn, dict):
            continue
        role = str(turn.get("role", "user"))
        author = str(turn.get("author", role))
        text = str(turn.get("text", "")).strip()
        if text:
            lines.append(f"{author}: {text}")


def append_context_blocks(
    lines: list[str],
    *,
    memory_context: str = "",
    tool_context: str = "",
    crm_context: str = "",
) -> None:
    if memory_context:
        lines.extend(["", memory_context])
    if crm_context:
        lines.extend(["", crm_context])
    if tool_context:
        lines.extend(["", "Tool context:", tool_context])


def normalize_account_id(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_.-]+", "-", value.strip())[:80].strip(".-")
    return clean or DEFAULT_ACCOUNT_ID


def get_memory(agent_id: str, *, account_id: str = ACCOUNT_ID) -> AgentMemoryStore:
    return memory_store(MEMORY_ROOT, account_id=account_id, agent_id=agent_id)


def get_crm(*, account_id: str = ACCOUNT_ID) -> LocalCRM:
    return LocalCRM(DATA_DIR, account_id=account_id)


def memory_turns(
    agent_id: str,
    *,
    account_id: str = ACCOUNT_ID,
    limit: int = 8,
) -> list[dict[str, str]]:
    store = get_memory(agent_id, account_id=account_id)
    with store._connect() as db:  # local lightweight read helper
        rows = db.execute(
            """
            select role, author, text
            from messages
            where text != ''
            order by id desc
            limit ?
            """,
            (limit,),
        ).fetchall()
    return [
        {"role": str(row["role"]), "author": str(row["author"]), "text": str(row["text"])}
        for row in reversed(rows)
    ]


def agent_message(
    author: str,
    text: str,
    *,
    phase: str,
    audience: str,
    from_id: str,
    to_id: str = "",
    is_final: bool = False,
    run_id: str = "",
) -> dict[str, Any]:
    return {
        "author": author,
        "text": text,
        "type": "agent",
        "phase": phase,
        "audience": audience,
        "from": from_id,
        "to": to_id,
        "isFinal": is_final,
        "runId": run_id,
    }


def agent_payload(agent_id: str) -> dict[str, str]:
    payload = dict(AGENTS[agent_id])
    if agent_id != "all":
        payload["model"] = CODEX_MODEL_OVERRIDES.get(agent_id, "")
    return payload


def attachment_metadata(turn_context: TurnContext) -> list[dict[str, Any]]:
    return [
        {
            "name": item.name,
            "contentType": item.content_type,
            "size": item.size,
        }
        for item in turn_context.attachments
    ]


def normalize_user_questions(value: object) -> list[str]:
    if isinstance(value, list):
        result = [str(item).strip() for item in value if str(item).strip()]
        return result[:5]
    text = str(value or "").strip()
    return [text] if text else []


def run_assignment_reports(
    assignments: list[dict[str, str]],
    effective_message: str,
    turn_context: TurnContext,
    run_id: str,
    session_id: str,
    account_id: str,
) -> list[dict[str, Any]]:
    if len(assignments) <= 1:
        return [
            run_single_assignment_report(
                assignment,
                effective_message,
                turn_context,
                run_id,
                session_id,
                account_id,
            )
            for assignment in assignments
        ]

    max_workers = min(4, len(assignments))
    results: list[dict[str, Any] | None] = [None] * len(assignments)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                run_single_assignment_report,
                assignment,
                effective_message,
                turn_context,
                run_id,
                session_id,
                account_id,
            )
            for assignment in assignments
        ]
        for index, future in enumerate(futures):
            results[index] = future.result()
    return [item for item in results if item is not None]


def run_single_assignment_report(
    assignment: dict[str, str],
    effective_message: str,
    turn_context: TurnContext,
    run_id: str,
    session_id: str,
    account_id: str,
) -> dict[str, Any]:
    agent_id = assignment["agentId"]
    agent_store = get_memory(agent_id, account_id=account_id)
    agent_store.add_message(
        role="assistant",
        author=AGENTS["coordinator"]["name"],
        text=assignment["task"],
        event_type="assignment",
        team_run_id=run_id,
        source_agent_id="coordinator",
        metadata={"sessionId": session_id},
    )
    report = run_ai(
        build_agent_report_prompt(
            agent_id,
            assignment["task"],
            effective_message,
            memory_turns(agent_id, account_id=account_id, limit=8),
            memory_context=agent_store.context_for_prompt(f"{effective_message}\n{assignment['task']}"),
            tool_context=turn_context.tool_context,
            crm_context=get_crm(account_id=account_id).context_for_query(effective_message)
            if agent_id in {"mika", "dev", "nova"}
            else "",
            language_source=turn_context.message,
        ),
        agent_id=agent_id,
        image_paths=turn_context.image_paths,
        search_enabled=wants_web_search(
            agent_id,
            effective_message,
            assignment["task"],
            turn_context.tool_context,
        ),
    )
    report_message_id = agent_store.add_message(
        role="assistant",
        author=AGENTS[agent_id]["name"],
        text=report,
        event_type="agent_report",
        team_run_id=run_id,
        source_agent_id=agent_id,
        metadata={"sessionId": session_id, "task": assignment["task"]},
    )
    auto_remember_if_useful(
        agent_store,
        text=f"Task: {assignment['task']}\nReport: {report}",
        title=f"{AGENTS[agent_id]['name']} report",
        source_message_id=report_message_id,
        event_type="agent_report",
        metadata={"sessionId": session_id, "runId": run_id},
    )
    if agent_id in {"mika", "nova"}:
        get_crm(account_id=account_id).note_interaction(
            agent_id=agent_id,
            message=effective_message,
            summary=report,
            metadata={"sessionId": session_id, "runId": run_id, "mode": "team"},
        )
    return {
        "report": {"agentId": agent_id, "agent": AGENTS[agent_id]["name"], "text": report},
        "message": agent_message(
            AGENTS[agent_id]["name"],
            report,
            phase="internal",
            audience="team",
            from_id=agent_id,
            to_id="coordinator",
            run_id=run_id,
        ),
    }


def run_internal_followups(
    turn_context: TurnContext,
    run_id: str,
    reports: list[dict[str, str]],
    *,
    account_id: str,
    effective_message: str | None = None,
) -> list[dict[str, Any]]:
    message = effective_message or turn_context.message
    followups: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for report in reports[:4]:
        question = extract_agent_question(report["text"])
        if question is None:
            continue
        target_id, question_text = question
        key = (target_id, question_text)
        if key in seen:
            continue
        seen.add(key)
        target_store = get_memory(target_id, account_id=account_id)
        answer = run_ai(
            build_agent_report_prompt(
                target_id,
                f"Ответь на внутренний вопрос от {report['agent']}: {question_text}",
                message,
                memory_turns(target_id, account_id=account_id, limit=8),
                memory_context=target_store.context_for_prompt(question_text),
                tool_context=turn_context.tool_context,
                crm_context=get_crm(account_id=account_id).context_for_query(message)
                if target_id in {"mika", "dev", "nova"}
                else "",
                language_source=turn_context.message,
            ),
            agent_id=target_id,
            image_paths=turn_context.image_paths,
            search_enabled=wants_web_search(target_id, message, question_text, turn_context.tool_context),
        )
        target_store.add_message(
            role="assistant",
            author=AGENTS[target_id]["name"],
            text=answer,
            event_type="agent_followup",
            team_run_id=run_id,
            source_agent_id=target_id,
            metadata={"question": question_text},
        )
        followups.append(
            {
                "report": {
                    "agentId": target_id,
                    "agent": AGENTS[target_id]["name"],
                    "text": answer,
                },
                "message": agent_message(
                    AGENTS[target_id]["name"],
                    answer,
                    phase="internal",
                    audience="team",
                    from_id=target_id,
                    to_id=report["agentId"],
                    run_id=run_id,
                ),
            }
        )
        if len(followups) >= 2:
            break
    return followups


def extract_agent_question(text: str) -> tuple[str, str] | None:
    pattern = re.compile(
        r"(?:Вопрос\s+к|Question\s+to)\s+(Ava|Mika|Scout|Dex|Dev|Echo|Nova|Atlas|Coordinator)\s*:\s*(.+)",
        flags=re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return None
    name = match.group(1).lower()
    question = match.group(2).strip()
    mapping = {
        "ava": "mika",
        "mika": "mika",
        "scout": "scout",
        "dex": "dev",
        "dev": "dev",
        "echo": "nova",
        "nova": "nova",
        "atlas": "coordinator",
        "coordinator": "coordinator",
    }
    target_id = mapping.get(name)
    if not target_id or not question:
        return None
    return target_id, question[:1000]


def parse_json_object(text: str) -> object:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def parse_multipart_payload(raw: bytes, content_type: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    parser = BytesParser(policy=policy.default)
    message = parser.parsebytes(
        b"Content-Type: "
        + content_type.encode("utf-8")
        + b"\r\nMIME-Version: 1.0\r\n\r\n"
        + raw
    )
    payload: dict[str, Any] = {}
    files: list[dict[str, Any]] = []
    for part in message.iter_parts():
        disposition = part.get("Content-Disposition", "")
        name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        data = part.get_payload(decode=True) or b""
        if name == "payload":
            payload = json.loads(data.decode("utf-8"))
        elif filename or name == "files":
            files.append(
                {
                    "name": filename or "attachment",
                    "content_type": part.get_content_type(),
                    "data": data,
                    "disposition": disposition,
                }
            )
    return payload, files


def normalize_assignments(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        agent_id = str(item.get("agentId", "")).strip().lower()
        task = str(item.get("task", "")).strip()
        if agent_id not in {"mika", "scout", "dev", "nova"} or not task or agent_id in seen:
            continue
        result.append({"agentId": agent_id, "task": task})
        seen.add(agent_id)
    return result[:4]


def keyword_decision(message: str) -> dict[str, Any]:
    lowered = message.lower()
    english = detected_output_language(message) == "English"
    assignments: list[dict[str, str]] = []
    if any(
        word in lowered
        for word in (
            "куп",
            "прод",
            "клиент",
            "цена",
            "оплат",
            "лид",
            "оффер",
            "direct",
            "директ",
            "скрипт",
            "возраж",
            "дорого",
            "заявк",
            "кп",
            "коммерческ",
            "buy",
            "sell",
            "sales",
            "client",
            "customer",
            "price",
            "payment",
            "lead",
            "offer",
            "objection",
            "expensive",
            "commercial",
            "proposal",
        )
    ):
        assignments.append({
            "agentId": "mika",
            "task": (
                "Analyze the sale, customer, offer, objection, and next step toward purchase."
                if english
                else "Разбери продажу, клиента, оффер, возражение и следующий шаг к покупке."
            ),
        })
    if any(
        word in lowered
        for word in (
            "пост",
            "контент",
            "сценар",
            "рилс",
            "reels",
            "shorts",
            "сторис",
            "story",
            "stories",
            "хук",
            "рубрик",
            "контент-план",
            "рынок",
            "тренд",
            "конкурент",
            "аудитор",
            "боли",
            "целевая",
            "темы",
            "идеи",
            "опубли",
            "вылож",
            "запости",
            "публикац",
            "post",
            "content",
            "script",
            "reel",
            "hook",
            "market",
            "trend",
            "competitor",
            "audience",
            "topic",
            "idea",
            "publish",
            "launch",
            "announce",
            "telegram post",
        )
    ):
        assignments.append({
            "agentId": "scout",
            "task": (
                "Prepare the content strategy: audience, angle, topics, hooks, format, script, and link to the business goal."
                if english
                else "Подготовь контент-стратегию: аудитория, угол, темы, хуки, форматы, сценарии и связь с бизнес-целью."
            ),
        })
    if any(
        word in lowered
        for word in (
            "аналит",
            "метрик",
            "бизнес-модель",
            "воронк",
            "выруч",
            "прибыл",
            "марж",
            "cac",
            "ltv",
            "roi",
            "romi",
            "конверс",
            "процесс",
            "операц",
            "риск",
            "гипотез",
            "эксперимент",
            "kpi",
            "unit",
            "юнит",
            "окупаем",
            "churn",
            "retention",
            "удержан",
            "себестоим",
            "бюджет",
            "рост",
            "узкое",
            "слабое",
            "финанс",
            "экономик",
            "analytics",
            "metric",
            "business model",
            "analyze",
            "funnel",
            "revenue",
            "profit",
            "margin",
            "conversion",
            "process",
            "operation",
            "risk",
            "hypothesis",
            "experiment",
            "growth",
            "finance",
            "economics",
        )
    ):
        assignments.append({
            "agentId": "dev",
            "task": (
                "Analyze the business model, funnel, metrics, unit economics, risks, bottlenecks, and improvement hypotheses."
                if english
                else "Проанализируй бизнес-модель, воронку, метрики, юнит-экономику, риски, узкие места и гипотезы улучшения."
            ),
        })
    if any(
        word in lowered
        for word in (
            "коммент",
            "вопрос",
            "ответ",
            "директ",
            "direct",
            "dm",
            "сообщ",
            "поддерж",
            "отзыв",
            "жалоб",
            "негатив",
            "faq",
            "частые вопросы",
            "возврат",
            "претенз",
            "переписк",
            "whatsapp",
            "ватсап",
            "telegram",
            "телеграм",
            "оператор",
            "написал",
            "написала",
            "спрашивает",
            "спросил",
            "спросила",
            "опубли",
            "вылож",
            "запости",
            "публикац",
            "канал",
            "comment",
            "question",
            "answer",
            "reply",
            "message",
            "support",
            "review",
            "complaint",
            "negative",
            "refund",
            "claim",
            "inbox",
            "channel",
        )
    ):
        assignments.append({
            "agentId": "nova",
            "task": (
                "Prepare the communication response: user intent, channel, tone, ready wording, escalation, and next step."
                if english
                else "Подготовь коммуникационный ответ: намерение человека, канал, тон, готовая формулировка, эскалация и следующий шаг."
            ),
        })
    return {
        "action": "delegate" if assignments else "answer_direct",
        "coordinatorMessage": (
            "I am assigning the right agents with separate tasks."
            if assignments and english
            else "Подключаю нужных агентов и даю им отдельные поручения."
            if assignments
            else ""
        ),
        "needsUserInput": False,
        "userQuestions": [],
        "assignments": assignments,
    }


def wants_web_search(agent_id: str, *texts: str) -> bool:
    if not AGENT_SEARCH_ENABLED.get(agent_id, False):
        return False
    value = " ".join(text for text in texts if text).lower()
    if not value:
        return False
    return any(trigger in value for trigger in WEB_SEARCH_TRIGGERS)


def wants_telegram_publish(text: str) -> bool:
    lowered = text.lower()
    return any(trigger in lowered for trigger in PUBLISH_TRIGGERS)


def split_publish_text(reply: str) -> tuple[str, str]:
    match = re.search(r"<PUBLISH_TEXT>\s*(.*?)\s*</PUBLISH_TEXT>", reply, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return reply.strip(), ""
    publish_text = match.group(1).strip()
    display_text = (reply[: match.start()] + reply[match.end() :]).strip()
    return display_text or "Готово. Текст подготовлен к публикации после подтверждения.", publish_text


def build_pending_publish(
    user_message: str,
    final_reply: str,
    publish_text: str,
    *,
    run_id: str,
) -> dict[str, Any] | None:
    if not wants_telegram_publish(user_message):
        return None
    text = (publish_text or final_reply).strip()
    if not text:
        return None
    auto_publish = os.environ.get("TELEGRAM_AUTO_PUBLISH", "true").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    return {
        "platform": "telegram",
        "status": "auto_publish_pending" if auto_publish else "approval_required",
        "text": text[:4000],
        "runId": run_id,
        "source": "team",
        "autoPublish": auto_publish,
    }


def run_ai(
    prompt: str,
    *,
    agent_id: str = "coordinator",
    image_paths: list[Path] | None = None,
    search_enabled: bool | None = None,
) -> str:
    try:
        return run_codex(
            prompt,
            agent_id=agent_id,
            image_paths=image_paths,
            search_enabled=search_enabled,
        )
    except RuntimeError as codex_error:
        try:
            return run_openrouter(
                prompt,
                agent_id=agent_id,
                image_paths=image_paths or [],
                search_enabled=search_enabled,
            )
        except RuntimeError as openrouter_error:
            codex_detail = str(codex_error)[-500:]
            openrouter_detail = str(openrouter_error)[-500:]
            raise RuntimeError(
                f"AI backend не ответил. Codex primary: {codex_detail}. "
                f"OpenRouter fallback: {openrouter_detail}"
            ) from openrouter_error


def run_openrouter(
    prompt: str,
    *,
    agent_id: str,
    image_paths: list[Path],
    search_enabled: bool | None,
) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")

    payload: dict[str, Any] = {
        "model": AGENT_MODEL_OVERRIDES.get(agent_id, AGENT_MODEL_OVERRIDES["coordinator"]),
        "messages": [{"role": "user", "content": openrouter_content(prompt, image_paths)}],
        "max_tokens": 8000,
    }
    effective_search_enabled = (
        AGENT_SEARCH_ENABLED.get(agent_id, False) if search_enabled is None else bool(search_enabled)
    )
    if effective_search_enabled:
        payload["tools"] = [{"type": "openrouter:web_search"}]

    request = urllib.request.Request(
        OPENROUTER_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Rebly AI Agent Team",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[-1200:]
        raise RuntimeError(f"OpenRouter HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenRouter request failed: {exc.reason}") from exc

    try:
        data = json.loads(raw)
        message = data["choices"][0]["message"]
        content = message.get("content", "")
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("OpenRouter returned an unexpected response") from exc

    reply = normalize_openrouter_content(content)
    if not reply:
        raise RuntimeError("OpenRouter returned an empty response")
    return reply


def openrouter_content(prompt: str, image_paths: list[Path]) -> str | list[dict[str, Any]]:
    if not image_paths:
        return prompt
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for image_path in image_paths:
        mime_type = mimetypes.guess_type(str(image_path))[0] or "image/png"
        data = base64.b64encode(image_path.read_bytes()).decode("ascii")
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{data}"}})
    return content


def normalize_openrouter_content(content: object) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts).strip()
    return ""


def run_codex(
    prompt: str,
    *,
    agent_id: str = "coordinator",
    image_paths: list[Path] | None = None,
    search_enabled: bool | None = None,
) -> str:
    if not shutil.which("codex"):
        raise RuntimeError("Codex CLI не найден. Запусти сервер на машине, где доступен codex.")

    model = CODEX_MODEL_OVERRIDES.get(agent_id)
    effective_search_enabled = (
        AGENT_SEARCH_ENABLED.get(agent_id, False) if search_enabled is None else bool(search_enabled)
    )
    attempts: list[tuple[str | None, bool]] = [(model, effective_search_enabled)]
    if effective_search_enabled:
        attempts.append((model, False))
    if model:
        attempts.append((None, effective_search_enabled))
    if model and effective_search_enabled:
        attempts.append((None, False))

    last_error: RuntimeError | None = None
    tried: set[tuple[str | None, bool]] = set()
    for attempt_model, attempt_search in attempts:
        key = (attempt_model, attempt_search)
        if key in tried:
            continue
        tried.add(key)
        try:
            return _run_codex_once(
                prompt,
                model=attempt_model,
                image_paths=image_paths or [],
                search_enabled=attempt_search,
            )
        except RuntimeError as exc:
            detail = str(exc).lower()
            can_fallback_search = attempt_search and any(
                marker in detail for marker in SEARCH_FALLBACK_MARKERS
            )
            can_fallback_model = bool(attempt_model) and any(
                marker in detail for marker in MODEL_FALLBACK_MARKERS
            )
            if can_fallback_search or can_fallback_model:
                last_error = exc
                continue
            raise
    if last_error:
        raise last_error
    raise RuntimeError("Codex CLI failed before execution.")


def _run_codex_once(
    prompt: str,
    *,
    model: str | None,
    image_paths: list[Path],
    search_enabled: bool,
) -> str:
    with tempfile.TemporaryDirectory(prefix="n1n-agent-") as temp_dir:
        output_file = Path(temp_dir) / "reply.txt"
        command = ["codex", "-a", "never"]
        if search_enabled:
            command.append("--search")
        command.append("exec")
        for image_path in image_paths:
            command.extend(["--image", str(image_path)])
        command.extend(
            [
                "--skip-git-repo-check",
                "--ephemeral",
                "--cd",
                str(ROOT),
                "--output-last-message",
                str(output_file),
                "-s",
                "read-only",
            ]
        )
        if model:
            command.extend(["--model", model])
        command.append("-")
        process = subprocess.run(
            command,
            input=prompt,
            text=True,
            capture_output=True,
            env=codex_environment(),
            check=False,
        )
        if process.returncode != 0:
            detail = (process.stderr or process.stdout or "Codex CLI failed").strip()
            raise RuntimeError(detail[-1200:])
        if output_file.exists():
            reply = output_file.read_text(encoding="utf-8").strip()
            if reply:
                return reply
        reply = process.stdout.strip()
        if reply:
            return reply
    raise RuntimeError("Codex вернул пустой ответ.")


def codex_environment() -> dict[str, str]:
    env = os.environ.copy()
    if hasattr(os, "getuid"):
        uid = os.getuid()
        env.setdefault("XDG_RUNTIME_DIR", f"/run/user/{uid}")
        env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{uid}/bus")
    return env


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()

    os.chdir(ROOT)
    server = ThreadingHTTPServer((args.host, args.port), AgentHandler)
    print(f"Serving AI agent API on http://{args.host}:{args.port}/api/agents/chat", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
