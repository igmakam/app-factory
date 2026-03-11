"""
Activity: Market Validation
ASO research, competitor analysis, demand scoring
"""

import os
import json
from dataclasses import dataclass
from temporalio import activity
from anthropic import Anthropic
from .idea import IdeaResult

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


@dataclass
class ValidationInput:
    app_id: int
    idea: IdeaResult


@dataclass
class ValidationResult:
    app_id: int
    score: float
    market_summary: str
    competitors: list[dict]
    aso_keywords: list[str]
    go_no_go: str  # "go" | "review" | "no-go"
    risks: list[str]
    opportunities: list[str]


@activity.defn
async def validate_market(input: ValidationInput) -> ValidationResult:
    activity.logger.info(f"[validation] Validating: {input.idea.idea_name}")

    idea = input.idea
    prompt = f"""You are a mobile app market analyst. Validate this app idea for market viability.

App: {idea.idea_name}
Type: {idea.product_type}
Problem: {idea.structured_idea.get('problem_statement', '')}
Solution: {idea.structured_idea.get('proposed_solution', '')}
Target: {idea.structured_idea.get('target_users', '')}
Monetization: {idea.structured_idea.get('monetization_model', '')}

Return ONLY valid JSON:
{{
  "score": 7.5,
  "market_summary": "2-3 sentence market overview",
  "competitors": [
    {{"name": "App Name", "store_rating": 4.2, "downloads": "1M+", "weakness": "..."}}
  ],
  "aso_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "go_no_go": "go",
  "risks": ["risk1", "risk2"],
  "opportunities": ["opportunity1", "opportunity2"]
}}

go_no_go rules: score>=7 → "go", score 5-7 → "review", score<5 → "no-go"
"""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    data = json.loads(raw)

    activity.logger.info(f"[validation] Score: {data['score']}, Decision: {data['go_no_go']}")

    return ValidationResult(
        app_id=input.app_id,
        score=data["score"],
        market_summary=data["market_summary"],
        competitors=data["competitors"],
        aso_keywords=data["aso_keywords"],
        go_no_go=data["go_no_go"],
        risks=data["risks"],
        opportunities=data["opportunities"],
    )
