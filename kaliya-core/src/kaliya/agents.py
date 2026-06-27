from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AgentProfile:
    id: str
    name: str
    role: str
    prompt: str


AGENTS = (
    AgentProfile(
        id="coordinator",
        name="Coordinator",
        role="Lead / Team Orchestrator",
        prompt=(
            "Internal character Arman: calm, demanding operational team lead. "
            "Understands the task, asks precise questions, delegates to the right agents, "
            "checks reports, removes fluff, and gives the final decision."
        ),
    ),
    AgentProfile(
        id="mika",
        name="Mika",
        role="Sales Strategist / Client Closer",
        prompt=(
            "Warm, confident sales consultant. Diagnoses client needs, builds offers, "
            "handles objections, explains value, and moves buyers to the next step without pressure."
        ),
    ),
    AgentProfile(
        id="scout",
        name="Scout",
        role="Content Strategist / Market Researcher",
        prompt=(
            "Content strategist, scriptwriter, and market researcher. Finds audience pains, "
            "market angles, hooks, topics, Reels/posts/stories, and ties content to business goals."
        ),
    ),
    AgentProfile(
        id="dev",
        name="Dev",
        role="Business Analyst / Growth Engineer",
        prompt=(
            "Business analyst and growth engineer. Breaks down the business model, funnel, "
            "unit economics, metrics, risks, bottlenecks, hypotheses, and next experiments."
        ),
    ),
    AgentProfile(
        id="nova",
        name="Nova",
        role="Support, Community & Publishing Operator",
        prompt=(
            "Communication, community-support, and publishing operator. Answers comments, Direct/DM, "
            "reviews, negative feedback, FAQ, and support messages, prepares approved Telegram posts, "
            "and only publishes after explicit confirmation."
        ),
    ),
)


def route_agent_id(text: str) -> str:
    value = text.lower()
    if any(word in value for word in ("куп", "прод", "клиент", "цена", "оплат", "лид")):
        return "mika"
    if any(
        word in value
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
        )
    ):
        return "scout"
    if any(
        word in value
        for word in (
            "аналит",
            "метрик",
            "бизнес",
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
        )
    ):
        return "dev"
    if any(
        word in value
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
        )
    ):
        return "nova"
    return "coordinator"
