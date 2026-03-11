"""
Activity: Idea Generation
Používa Claude Sonnet na spracovanie raw inputu → štruktúrovaná idea
"""

import os
import json
from dataclasses import dataclass
from temporalio import activity
from anthropic import Anthropic

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
client = Anthropic(api_key=ANTHROPIC_API_KEY)


@dataclass
class IdeaInput:
    app_id: int
    raw_input: str


@dataclass
class IdeaResult:
    app_id: int
    idea_name: str
    product_type: str
    overall_score: float
    structured_idea: dict
    scores: dict
    valuation: dict
    build_brief: dict


@activity.defn
async def generate_idea(input: IdeaInput) -> IdeaResult:
    activity.logger.info(f"[idea] Processing: {input.raw_input[:100]}...")

    prompt = f"""You are an expert mobile app idea analyst. Analyze this idea and return a structured JSON.

Idea: {input.raw_input}

Return ONLY valid JSON with this exact structure:
{{
  "idea_name": "Short punchy name",
  "product_type": "App type (e.g. Productivity, Health, Finance, Social, Game, Tool)",
  "overall_score": 8.5,
  "structured_idea": {{
    "problem_statement": "...",
    "proposed_solution": "...",
    "target_users": "...",
    "core_value_proposition": "...",
    "monetization_model": "Freemium/Subscription/One-time/Ads",
    "market_size": "small/medium/large",
    "competition_level": "low/medium/high"
  }},
  "scores": {{
    "market_potential": 8.0,
    "feasibility": 7.5,
    "uniqueness": 9.0,
    "monetization": 8.0,
    "virality": 7.0
  }},
  "valuation": {{
    "estimated_mrr_potential": "$5k-50k",
    "time_to_market": "4-8 weeks",
    "development_complexity": "medium"
  }},
  "build_brief": {{
    "product_name": "...",
    "core_features": ["feature1", "feature2", "feature3"],
    "mvp_scope": ["mvp feature 1", "mvp feature 2"],
    "suggested_tech_stack": {{
      "ios": "SwiftUI",
      "android": "Jetpack Compose",
      "backend": "FastAPI + PostgreSQL"
    }},
    "basic_user_flow": ["step1", "step2", "step3"]
  }}
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()
    # Extract JSON if wrapped in markdown
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    data = json.loads(raw)

    activity.logger.info(f"[idea] Generated: {data['idea_name']} (score: {data['overall_score']})")

    return IdeaResult(
        app_id=input.app_id,
        idea_name=data["idea_name"],
        product_type=data["product_type"],
        overall_score=data["overall_score"],
        structured_idea=data["structured_idea"],
        scores=data["scores"],
        valuation=data["valuation"],
        build_brief=data["build_brief"],
    )
