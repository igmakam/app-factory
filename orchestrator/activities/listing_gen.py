"""
Activity: Store Listing Generation
AI generuje ASO-optimalizované store listings (prebraté a vylepšené z Autolauncher)
"""

import os
import json
from dataclasses import dataclass, field
from temporalio import activity
from anthropic import Anthropic
from .idea import IdeaResult

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


@dataclass
class ListingInput:
    app_id: int
    idea: IdeaResult
    platform: str
    bundle_id: str = ""


@dataclass
class ListingResult:
    app_id: int
    bundle_id: str
    aso_score: int
    ios_listing: dict = field(default_factory=dict)
    android_listing: dict = field(default_factory=dict)
    keywords: list[str] = field(default_factory=list)
    viral_hooks: list[str] = field(default_factory=list)


@activity.defn
async def generate_listing(input: ListingInput) -> ListingResult:
    activity.logger.info(f"[listing] Generating for {input.idea.idea_name}")

    idea = input.idea
    platforms = []
    if input.platform in ("ios", "both"):
        platforms.append("ios")
    if input.platform in ("android", "both"):
        platforms.append("android")

    ios_listing = {}
    android_listing = {}

    for platform in platforms:
        activity.heartbeat(f"Generating {platform} listing")
        listing = await _generate_platform_listing(idea, platform)
        if platform == "ios":
            ios_listing = listing
        else:
            android_listing = listing

    # Use ios listing for shared data, fallback to android
    primary = ios_listing or android_listing
    aso_score = primary.get("aso_score", 75)
    keywords = primary.get("keywords", "").split(",") if primary.get("keywords") else []
    viral_hooks = primary.get("viral_hooks", [])

    # Generate bundle ID from app name
    bundle_id = input.bundle_id or (
        f"com.appfactory.{idea.idea_name.lower().replace(' ', '').replace('-', '')}"
    )

    activity.logger.info(f"[listing] ASO score: {aso_score}")

    return ListingResult(
        app_id=input.app_id,
        bundle_id=bundle_id,
        aso_score=aso_score,
        ios_listing=ios_listing,
        android_listing=android_listing,
        keywords=keywords[:100],
        viral_hooks=viral_hooks,
    )


async def _generate_platform_listing(idea: IdeaResult, platform: str) -> dict:
    """Generuje store listing pre konkrétnu platformu."""
    structured = idea.structured_idea
    build_brief = idea.build_brief

    platform_notes = {
        "ios": "Apple App Store: title max 30 chars, subtitle max 30 chars, keywords max 100 chars total, description max 4000 chars.",
        "android": "Google Play: title max 50 chars, short description max 80 chars, full description max 4000 chars.",
    }

    prompt = f"""You are an expert ASO (App Store Optimization) specialist.
Generate a complete, optimized store listing for this app.

{platform_notes[platform]}

App: {idea.idea_name}
Type: {idea.product_type}
Problem: {structured.get('problem_statement', '')}
Solution: {structured.get('proposed_solution', '')}
Target users: {structured.get('target_users', '')}
Core features: {json.dumps(build_brief.get('core_features', []))}
Monetization: {structured.get('monetization_model', 'Freemium')}

Return ONLY valid JSON:
{{
  "title": "App Name (max 30 chars for iOS, 50 for Android)",
  "subtitle": "Short tagline (iOS only, max 30 chars)",
  "short_description": "Hook sentence (Android, max 80 chars)",
  "description": "Full description with features, benefits, social proof (400-600 words)",
  "keywords": "keyword1,keyword2,keyword3 (comma separated, max 100 chars iOS)",
  "whats_new": "Version 1.0 - Initial release with core features",
  "promotional_text": "Limited time: Premium free for first 1000 users!",
  "category": "Productivity",
  "pricing_model": "Freemium",
  "aso_score": 82,
  "aso_tips": ["tip1", "tip2", "tip3"],
  "viral_hooks": ["hook1", "hook2", "hook3"],
  "growth_strategies": ["strategy1", "strategy2"]
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    return json.loads(raw)
