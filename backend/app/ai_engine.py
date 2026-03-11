"""Multi-agent AI engine for generating TOP notch store listings, ASO, viral hooks, and growth strategies."""
import os
import json
from openai import AsyncOpenAI
from datetime import datetime, timezone

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


async def get_openai_client() -> AsyncOpenAI:
    key = OPENAI_API_KEY
    if not key:
        from app.database import DATABASE_PATH
        env_path = os.path.join(os.path.dirname(DATABASE_PATH), ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("OPENAI_API_KEY="):
                        key = line.strip().split("=", 1)[1]
    return AsyncOpenAI(api_key=key)


QUESTIONNAIRE_QUESTIONS = [
    {"key": "app_name", "question": "What is your app's name?", "description": "The official name that will appear on the store", "input_type": "text", "required": True, "category": "basic"},
    {"key": "app_tagline", "question": "Write a short tagline (max 30 chars)", "description": "A catchy subtitle, e.g. 'Your AI Fitness Coach'", "input_type": "text", "required": True, "category": "basic"},
    {"key": "app_description_brief", "question": "Describe your app in 2-3 sentences", "description": "What does your app do? What problem does it solve?", "input_type": "textarea", "required": True, "category": "basic"},
    {"key": "target_audience", "question": "Who is your target audience?", "description": "Describe your ideal user - age, interests, profession, pain points", "input_type": "textarea", "required": True, "category": "audience"},
    {"key": "category", "question": "App Store Category", "description": "Primary category for your app", "input_type": "select", "options": ["Business", "Developer Tools", "Education", "Entertainment", "Finance", "Food & Drink", "Games", "Graphics & Design", "Health & Fitness", "Lifestyle", "Medical", "Music", "Navigation", "News", "Photo & Video", "Productivity", "Reference", "Shopping", "Social Networking", "Sports", "Travel", "Utilities", "Weather"], "required": True, "category": "store"},
    {"key": "secondary_category", "question": "Secondary Category (optional)", "description": "A secondary category to increase discoverability", "input_type": "select", "options": ["None", "Business", "Developer Tools", "Education", "Entertainment", "Finance", "Food & Drink", "Games", "Graphics & Design", "Health & Fitness", "Lifestyle", "Medical", "Music", "Navigation", "News", "Photo & Video", "Productivity", "Reference", "Shopping", "Social Networking", "Sports", "Travel", "Utilities", "Weather"], "required": False, "category": "store"},
    {"key": "unique_selling_points", "question": "What makes your app unique? (3-5 USPs)", "description": "List the key features or benefits that differentiate you from competitors", "input_type": "textarea", "required": True, "category": "positioning"},
    {"key": "competitor_apps", "question": "Name 2-5 competitor apps", "description": "Apps you compete with or that are similar to yours", "input_type": "textarea", "required": True, "category": "positioning"},
    {"key": "pricing_model", "question": "Pricing Model", "description": "How will you monetize?", "input_type": "select", "options": ["Free", "Freemium", "Paid", "Subscription", "In-App Purchases"], "required": True, "category": "monetization"},
    {"key": "price_point", "question": "Price (if paid/subscription)", "description": "e.g. $4.99, $9.99/month, Free with IAP", "input_type": "text", "required": False, "category": "monetization"},
    {"key": "key_features", "question": "List your top 5 features", "description": "The most important features to highlight in the store listing", "input_type": "textarea", "required": True, "category": "features"},
    {"key": "viral_mechanism", "question": "Does your app have any viral/sharing features?", "description": "e.g. referral program, share results, invite friends, social features", "input_type": "textarea", "required": False, "category": "growth"},
    {"key": "languages", "question": "Which languages should the listing support?", "description": "e.g. English, Spanish, German, French, Japanese", "input_type": "text", "required": True, "category": "localization"},
    {"key": "keywords_seed", "question": "Seed keywords (10-20 words related to your app)", "description": "Words users might search for to find your type of app", "input_type": "textarea", "required": True, "category": "aso"},
    {"key": "launch_goals", "question": "What are your launch goals?", "description": "e.g. 10K downloads in first month, top 100 in category, featured by Apple", "input_type": "textarea", "required": False, "category": "growth"},
]


async def generate_store_listing(answers: dict, platform: str = "ios") -> dict:
    """Generate a complete, ASO-optimized store listing using multi-agent approach."""
    client = await get_openai_client()
    total_tokens = 0

    store_name = "App Store Connect" if platform == "ios" else "Google Play"

    # AGENT 1: ASO Keyword Research
    aso_prompt = (
        "You are an elite App Store Optimization (ASO) specialist. Find the BEST keywords for maximum visibility.\n\n"
        f"App: {answers.get('app_name', '')} | {answers.get('app_description_brief', '')}\n"
        f"Category: {answers.get('category', '')} | Audience: {answers.get('target_audience', '')}\n"
        f"Competitors: {answers.get('competitor_apps', '')} | Seeds: {answers.get('keywords_seed', '')}\n"
        f"Platform: {platform}\n\n"
        'Generate JSON: {"primary_keywords": ["20 high-volume low-competition keywords"], '
        '"long_tail_keywords": ["15 long-tail phrases"], '
        f'"keyword_field": "100 chars comma-separated keywords for {store_name}", '
        '"trending_keywords": ["5 trending keywords"], '
        '"competitor_keywords": ["10 competitor keywords"], '
        '"aso_score_prediction": 85, '
        '"aso_tips": ["5 actionable tips"]}\n'
        "Return ONLY valid JSON."
    )

    aso_response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "ASO expert. Return only valid JSON."},
                  {"role": "user", "content": aso_prompt}],
        temperature=0.7, max_tokens=2000,
    )
    total_tokens += aso_response.usage.total_tokens if aso_response.usage else 0
    aso_data = _parse_json_response(aso_response.choices[0].message.content or "{}")

    # AGENT 2: Copywriting
    keywords_to_use = json.dumps(aso_data.get("primary_keywords", [])[:10])
    copy_prompt = (
        "You are a world-class app store copywriter. Your copy converts at 3x industry average.\n\n"
        f"App: {answers.get('app_name', '')} - {answers.get('app_tagline', '')}\n"
        f"Description: {answers.get('app_description_brief', '')}\n"
        f"USPs: {answers.get('unique_selling_points', '')}\n"
        f"Features: {answers.get('key_features', '')}\n"
        f"Audience: {answers.get('target_audience', '')} | Category: {answers.get('category', '')}\n"
        f"Pricing: {answers.get('pricing_model', '')} {answers.get('price_point', '')}\n"
        f"Platform: {platform} | ASO Keywords: {keywords_to_use}\n\n"
        'Generate JSON: {"title": "max 30 chars iOS/50 GP", "subtitle": "max 30 chars", '
        '"description": "Full 4000 char desc with opening hook, emoji bullets, social proof, CTA, keywords", '
        '"promotional_text": "170 chars max", "whats_new": "v1.0 notes"}\n'
        "First 3 lines most important. Power words. Emotional triggers. Emoji bullets. Strong CTA.\n"
        "Return ONLY valid JSON."
    )

    copy_response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "Elite app copywriter. Return only valid JSON."},
                  {"role": "user", "content": copy_prompt}],
        temperature=0.8, max_tokens=3000,
    )
    total_tokens += copy_response.usage.total_tokens if copy_response.usage else 0
    copy_data = _parse_json_response(copy_response.choices[0].message.content or "{}")

    # AGENT 3: Viral Growth
    viral_prompt = (
        "You are a viral growth hacker who engineered virality for #1 apps.\n\n"
        f"App: {answers.get('app_name', '')} | {answers.get('app_description_brief', '')}\n"
        f"Audience: {answers.get('target_audience', '')} | Viral: {answers.get('viral_mechanism', 'None')}\n"
        f"Competitors: {answers.get('competitor_apps', '')} | Goals: {answers.get('launch_goals', '')}\n"
        f"Pricing: {answers.get('pricing_model', '')}\n\n"
        'Generate JSON: {"viral_hooks": [{"name": "Hook", "description": "Mechanism", '
        '"implementation": "How", "expected_k_factor": "1.3", "priority": "high"}], '
        '"growth_strategies": [{"strategy": "Name", "description": "Detail", '
        '"timeline": "pre-launch/launch/week1/month1", "estimated_impact": "Downloads", '
        '"cost": "Free/$", "priority": "high"}], '
        '"launch_day_plan": {"pre_launch": ["items"], "launch_day": ["items"], '
        '"week_1": ["items"], "month_1": ["items"]}, '
        '"additional_recommendations": ["AI-suggested products/services"]}\n'
        "Focus on ACTIONABLE free/low-cost high-impact strategies. Return ONLY valid JSON."
    )

    viral_response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "Viral growth expert. Return only valid JSON."},
                  {"role": "user", "content": viral_prompt}],
        temperature=0.8, max_tokens=3000,
    )
    total_tokens += viral_response.usage.total_tokens if viral_response.usage else 0
    viral_data = _parse_json_response(viral_response.choices[0].message.content or "{}")

    # AGENT 4: Competitor Analysis
    comp_prompt = (
        "You are a competitive intelligence analyst for the app market.\n\n"
        f"App: {answers.get('app_name', '')} | Competitors: {answers.get('competitor_apps', '')}\n"
        f"Category: {answers.get('category', '')} | USPs: {answers.get('unique_selling_points', '')}\n\n"
        'Generate JSON: {"competitor_analysis": "Detailed markdown analysis", '
        '"positioning_statement": "Clear statement", '
        '"blue_ocean_opportunities": ["Untapped opportunities"]}\n'
        "Return ONLY valid JSON."
    )

    comp_response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "Competitive analyst. Return only valid JSON."},
                  {"role": "user", "content": comp_prompt}],
        temperature=0.7, max_tokens=2000,
    )
    total_tokens += comp_response.usage.total_tokens if comp_response.usage else 0
    comp_data = _parse_json_response(comp_response.choices[0].message.content or "{}")

    max_title_len = 30 if platform == "ios" else 50
    title = copy_data.get("title", answers.get("app_name", ""))[:max_title_len]

    return {
        "title": title,
        "subtitle": copy_data.get("subtitle", answers.get("app_tagline", ""))[:30],
        "description": copy_data.get("description", ""),
        "keywords": aso_data.get("keyword_field", ""),
        "whats_new": copy_data.get("whats_new", "Initial release"),
        "promotional_text": copy_data.get("promotional_text", ""),
        "category": answers.get("category", ""),
        "secondary_category": answers.get("secondary_category", "None"),
        "pricing_model": answers.get("pricing_model", "Free"),
        "price": answers.get("price_point", "0"),
        "aso_score": aso_data.get("aso_score_prediction", 0),
        "aso_tips": json.dumps(aso_data.get("aso_tips", [])),
        "viral_hooks": json.dumps(viral_data.get("viral_hooks", [])),
        "growth_strategies": json.dumps(viral_data.get("growth_strategies", [])),
        "competitor_analysis": comp_data.get("competitor_analysis", ""),
        "launch_day_plan": viral_data.get("launch_day_plan", {}),
        "additional_recommendations": viral_data.get("additional_recommendations", []),
        "positioning_statement": comp_data.get("positioning_statement", ""),
        "blue_ocean_opportunities": comp_data.get("blue_ocean_opportunities", []),
        "all_keywords": {
            "primary": aso_data.get("primary_keywords", []),
            "long_tail": aso_data.get("long_tail_keywords", []),
            "trending": aso_data.get("trending_keywords", []),
            "competitor": aso_data.get("competitor_keywords", []),
        },
        "tokens_used": total_tokens,
    }


async def generate_launch_strategy(answers: dict, listing_data: dict) -> dict:
    """AGENT 5: Generate comprehensive launch strategy, monetization advice, metrics plan, and common mistakes audit."""
    client = await get_openai_client()
    total_tokens = 0

    # AGENT 5a: Launch Strategy Timeline
    strategy_prompt = (
        "You are an elite app launch strategist who has launched 100+ top-charting apps.\n\n"
        f"App: {answers.get('app_name', '')} | {answers.get('app_description_brief', '')}\n"
        f"Category: {answers.get('category', '')} | Audience: {answers.get('target_audience', '')}\n"
        f"Pricing: {answers.get('pricing_model', '')} {answers.get('price_point', '')}\n"
        f"Goals: {answers.get('launch_goals', '')}\n"
        f"Viral features: {answers.get('viral_mechanism', 'None')}\n\n"
        'Generate JSON: {\n'
        '"pre_launch": [{"task": "Task name", "description": "Detailed description", "week": "Week -8 to -1", "priority": "critical/high/medium", "tools": ["Tool suggestions"]}],\n'
        '"launch_day": [{"task": "Task", "description": "Detail", "time": "Morning/Afternoon/Evening", "priority": "critical/high", "channel": "Channel"}],\n'
        '"post_launch": [{"task": "Task", "description": "Detail", "timeline": "Day 1/Week 1/Week 2/Month 1", "priority": "critical/high/medium", "kpi": "Metric to track"}],\n'
        '"product_hunt_plan": {"title": "PH title", "tagline": "PH tagline", "best_day": "Tuesday-Thursday", "best_time": "12:01 AM PST", "tips": ["5 tips"]},\n'
        '"pr_outreach": {"press_release_outline": "Brief outline", "target_outlets": ["5 outlets"], "email_template": "Brief template", "timing": "When to reach out"},\n'
        '"beta_testing": {"platforms": ["TestFlight/Google Play Beta"], "target_testers": 50, "feedback_questions": ["5 key questions"], "duration_days": 14}\n'
        '}\nReturn ONLY valid JSON.'
    )

    strategy_response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "Elite app launch strategist. Return only valid JSON."},
                  {"role": "user", "content": strategy_prompt}],
        temperature=0.7, max_tokens=3000,
    )
    total_tokens += strategy_response.usage.total_tokens if strategy_response.usage else 0
    strategy_data = _parse_json_response(strategy_response.choices[0].message.content or "{}")

    # AGENT 5b: Monetization + Metrics + Common Mistakes
    monetization_prompt = (
        "You are a mobile app monetization expert and growth analytics specialist.\n\n"
        f"App: {answers.get('app_name', '')} | {answers.get('app_description_brief', '')}\n"
        f"Category: {answers.get('category', '')} | Current pricing: {answers.get('pricing_model', '')} {answers.get('price_point', '')}\n"
        f"Audience: {answers.get('target_audience', '')}\n"
        f"Competitors: {answers.get('competitor_apps', '')}\n\n"
        'Generate JSON: {\n'
        '"monetization_recommendation": {"best_model": "Freemium/Subscription/Paid/IAP/Ads", "reasoning": "Why this model", "pricing_tiers": [{"name": "Free/Pro/Premium", "price": "$X", "features": ["Features"]}], "revenue_projection": {"month_1": "$X", "month_6": "$X", "year_1": "$X"}, "upsell_triggers": ["When to show paywall"]},\n'
        '"monetization_comparison": [{"model": "Freemium", "pros": ["pros"], "cons": ["cons"], "best_for": "When to use", "conversion_rate": "1-5%"}, {"model": "Subscription", "pros": ["pros"], "cons": ["cons"], "best_for": "When", "conversion_rate": "2-8%"}, {"model": "One-time Purchase", "pros": ["pros"], "cons": ["cons"], "best_for": "When", "conversion_rate": "varies"}, {"model": "In-App Purchases", "pros": ["pros"], "cons": ["cons"], "best_for": "When", "conversion_rate": "1-3%"}, {"model": "Ads", "pros": ["pros"], "cons": ["cons"], "best_for": "When", "conversion_rate": "N/A"}],\n'
        '"metrics_plan": {"conversion_rate": {"target": "X%", "how_to_improve": ["tips"]}, "day1_retention": {"target": "X%", "how_to_improve": ["tips"]}, "day7_retention": {"target": "X%", "how_to_improve": ["tips"]}, "day30_retention": {"target": "X%", "how_to_improve": ["tips"]}, "rating_target": {"target": "4.5+", "how_to_achieve": ["tips"]}, "crash_rate": {"target": "<1%", "how_to_maintain": ["tips"]}, "arpu": {"target": "$X", "how_to_increase": ["tips"]}},\n'
        '"common_mistakes": [{"mistake": "Mistake name", "description": "Why it is bad", "impact": "critical/high/medium", "prevention": "How to avoid", "applies_to_you": true}] (MUST include AT LEAST 8 common mistakes covering: bad screenshots, ignoring reviews, no community, no post-launch plan, complex onboarding, wrong pricing, no ASO, poor localization),\n'
        '"screenshot_tips": ["5 specific tips for this app screenshots"],\n'
        '"onboarding_tips": ["5 tips for smooth onboarding"]\n'
        '}\nReturn ONLY valid JSON.'
    )

    monetization_response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "Monetization and growth analytics expert. Return only valid JSON."},
                  {"role": "user", "content": monetization_prompt}],
        temperature=0.7, max_tokens=3000,
    )
    total_tokens += monetization_response.usage.total_tokens if monetization_response.usage else 0
    monetization_data = _parse_json_response(monetization_response.choices[0].message.content or "{}")

    return {
        "launch_strategy": {
            "pre_launch": strategy_data.get("pre_launch", []),
            "launch_day": strategy_data.get("launch_day", []),
            "post_launch": strategy_data.get("post_launch", []),
            "product_hunt_plan": strategy_data.get("product_hunt_plan", {}),
            "pr_outreach": strategy_data.get("pr_outreach", {}),
            "beta_testing": strategy_data.get("beta_testing", {}),
        },
        "monetization": {
            "recommendation": monetization_data.get("monetization_recommendation", {}),
            "comparison": monetization_data.get("monetization_comparison", []),
        },
        "metrics_plan": monetization_data.get("metrics_plan", {}),
        "common_mistakes": monetization_data.get("common_mistakes", []),
        "screenshot_tips": monetization_data.get("screenshot_tips", []),
        "onboarding_tips": monetization_data.get("onboarding_tips", []),
        "tokens_used": total_tokens,
    }


async def generate_campaign_content(content_type: str, answers: dict, listing_data: dict) -> dict:
    """AGENT 6: Generate ready-to-use campaign content that the user can directly publish."""
    client = await get_openai_client()

    app_name = answers.get("app_name", "")
    app_desc = answers.get("app_description_brief", "")
    audience = answers.get("target_audience", "")
    category = answers.get("category", "")
    usps = answers.get("unique_selling_points", "")
    pricing = answers.get("pricing_model", "")
    title = listing_data.get("title", app_name)
    subtitle = listing_data.get("subtitle", "")

    prompts = {
        "social_posts": (
            "You are a viral social media marketing expert for app launches.\n\n"
            f"App: {app_name} | {app_desc}\nAudience: {audience}\nUSPs: {usps}\n\n"
            "Generate READY-TO-POST social media content. Each post must be complete, engaging, with emojis and hashtags.\n"
            'Return JSON: {\n'
            '"twitter_posts": [{"text": "Complete tweet text with emojis and hashtags (max 280 chars)", "best_time": "Day & time to post", "goal": "awareness/engagement/conversion"}],\n'
            '"instagram_captions": [{"caption": "Full Instagram caption with emojis, line breaks, hashtags at bottom", "image_idea": "What the image should show", "best_time": "Day & time"}],\n'
            '"tiktok_scripts": [{"hook": "First 3 seconds hook", "script": "Full 30-60 second script with scenes", "text_overlay": "Text shown on screen", "sound_suggestion": "Trending sound idea"}],\n'
            '"linkedin_posts": [{"text": "Professional LinkedIn post about the app", "best_time": "Day & time"}],\n'
            '"reddit_posts": [{"subreddit": "r/relevant", "title": "Post title", "body": "Full post body (NOT promotional, value-first)", "flair": "Flair suggestion"}]\n'
            '}\nGenerate 3 items per platform. Return ONLY valid JSON.'
        ),
        "email_sequences": (
            "You are an expert email marketer specializing in app pre-launch and launch campaigns.\n\n"
            f"App: {app_name} | {app_desc}\nAudience: {audience}\nPricing: {pricing}\n\n"
            "Generate COMPLETE email sequences ready to send. Full subject lines and bodies.\n"
            'Return JSON: {\n'
            '"waitlist_welcome": {"subject": "Subject line", "body": "Full HTML-ready email body with greeting, value prop, what to expect, CTA"},\n'
            '"pre_launch_sequence": [{"day": 1, "subject": "Subject", "body": "Full email body", "goal": "Build excitement/educate/social proof"}, {"day": 3, "subject": "Subject", "body": "Body", "goal": "goal"}, {"day": 5, "subject": "Subject", "body": "Body", "goal": "goal"}, {"day": 7, "subject": "Subject", "body": "Body", "goal": "goal"}],\n'
            '"launch_day_email": {"subject": "Subject", "body": "Full launch announcement email with download links placeholder [APP_STORE_LINK] [PLAY_STORE_LINK]"},\n'
            '"post_launch_followup": [{"day": 1, "subject": "Subject", "body": "Body asking for reviews"}, {"day": 7, "subject": "Subject", "body": "Body with tips/features"}]\n'
            '}\nReturn ONLY valid JSON.'
        ),
        "press_release": (
            "You are a tech PR specialist who writes press releases that get published.\n\n"
            f"App: {app_name} | {app_desc}\nCategory: {category}\nAudience: {audience}\nUSPs: {usps}\n\n"
            "Generate a COMPLETE, ready-to-send press kit.\n"
            'Return JSON: {\n'
            '"press_release": {"headline": "Headline", "subheadline": "Subheadline", "body": "Full press release body (500+ words) with quotes, stats, boilerplate. Use [FOUNDER_NAME] and [COMPANY_NAME] as placeholders."},\n'
            '"media_pitch_email": {"subject": "Email subject for journalists", "body": "Full pitch email to send to tech journalists. Personal, concise, newsworthy angle."},\n'
            '"target_journalists": [{"name": "Journalist name or type", "outlet": "Publication", "beat": "Their coverage area", "pitch_angle": "Why they would care"}],\n'
            '"press_kit_checklist": ["Item needed for press kit"],\n'
            '"key_talking_points": ["5 key messages for interviews"]\n'
            '}\nReturn ONLY valid JSON.'
        ),
        "landing_page": (
            "You are a conversion-optimized landing page copywriter.\n\n"
            f"App: {app_name} ({subtitle}) | {app_desc}\nAudience: {audience}\nUSPs: {usps}\nPricing: {pricing}\n\n"
            "Generate COMPLETE landing page copy ready to use on a waitlist/pre-launch page.\n"
            'Return JSON: {\n'
            '"hero": {"headline": "Bold headline (max 10 words)", "subheadline": "Supporting text (max 25 words)", "cta_button": "CTA button text", "cta_subtext": "Text below CTA like Join X+ early adopters"},\n'
            '"features_section": {"title": "Section title", "features": [{"icon_name": "lucide icon name", "title": "Feature title", "description": "2-3 sentence description"}]},\n'
            '"social_proof": {"title": "Section title", "testimonials": [{"quote": "Testimonial quote", "name": "Name", "role": "Role/Title"}]},\n'
            '"faq": [{"question": "Q", "answer": "A"}],\n'
            '"final_cta": {"headline": "Urgency headline", "subtext": "Supporting text", "button": "CTA text"},\n'
            '"meta": {"page_title": "SEO title tag", "meta_description": "Meta description 155 chars", "og_title": "Social share title", "og_description": "Social share description"}\n'
            '}\nGenerate 5 features, 3 testimonials, 5 FAQs. Return ONLY valid JSON.'
        ),
        "product_hunt": (
            "You are a Product Hunt launch expert who has gotten multiple #1 Product of the Day.\n\n"
            f"App: {app_name} ({subtitle}) | {app_desc}\nAudience: {audience}\nUSPs: {usps}\n\n"
            "Generate COMPLETE Product Hunt launch content ready to submit.\n"
            'Return JSON: {\n'
            '"listing": {"tagline": "PH tagline (max 60 chars)", "description": "Full PH description (300+ words, markdown ok)", "topics": ["Relevant PH topics"], "thumbnail_idea": "What the thumbnail should show", "gallery_slides": [{"title": "Slide title", "description": "What to show"}]},\n'
            '"maker_comment": "First comment from the maker (authentic, grateful, explains why built it)",\n'
            '"launch_checklist": [{"task": "Task", "when": "Timing", "done": false}],\n'
            '"community_outreach": {"pre_launch_message": "DM to send to PH community before launch", "thank_you_message": "Message for supporters after launch"},\n'
            '"best_practices": {"best_day": "Tuesday-Thursday", "best_time": "12:01 AM PST", "tips": ["5 specific tips"]}\n'
            '}\nReturn ONLY valid JSON.'
        ),
    }

    if content_type not in prompts:
        return {"error": f"Unknown content type: {content_type}"}

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": f"Expert {content_type.replace('_', ' ')} content creator for app launches. Return only valid JSON."},
            {"role": "user", "content": prompts[content_type]}
        ],
        temperature=0.8, max_tokens=4000,
    )
    result = _parse_json_response(response.choices[0].message.content or "{}")
    result["content_type"] = content_type
    result["tokens_used"] = response.usage.total_tokens if response.usage else 0
    return result


async def generate_localization(listing_data: dict, target_language: str) -> dict:
    """Generate localized store listing for a target language."""
    client = await get_openai_client()

    prompt = (
        f"Expert app store localizer. Translate and ADAPT this listing for {target_language} speakers.\n"
        f"Title: {listing_data.get('title', '')} | Subtitle: {listing_data.get('subtitle', '')}\n"
        f"Description: {listing_data.get('description', '')[:1000]}\n"
        f"Keywords: {listing_data.get('keywords', '')}\n\n"
        'Generate JSON: {"title": "Localized", "subtitle": "Localized", '
        '"description": "Fully adapted", "keywords": "Local terms 100 chars", '
        '"promotional_text": "Localized promo"}\n'
        "ADAPT for local market, not just translate. Return ONLY valid JSON."
    )

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "Expert app localizer. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        temperature=0.7, max_tokens=2000,
    )
    result = _parse_json_response(response.choices[0].message.content or "{}")
    result["tokens_used"] = response.usage.total_tokens if response.usage else 0
    return result


async def generate_additional_growth_ideas(project_name: str, current_strategies: str) -> dict:
    """AI suggests additional products and strategies to boost app success."""
    client = await get_openai_client()

    prompt = (
        f"Startup advisor for app ecosystems. App: {project_name}\nCurrent: {current_strategies}\n\n"
        'Suggest products/strategies. JSON: {"companion_apps": [{"name": "App", "description": "How helps", '
        '"revenue_potential": "High"}], "saas_extensions": [{"name": "SaaS", "description": "Web ext", '
        '"revenue_potential": "High"}], "marketing_channels": [{"channel": "Ch", "strategy": "Strat", '
        '"estimated_cac": "$X"}], "partnership_ideas": [{"partner_type": "Type", "approach": "How"}], '
        '"revenue_optimization": ["Ideas"]}\nReturn ONLY valid JSON.'
    )

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "Startup growth advisor. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        temperature=0.8, max_tokens=2000,
    )
    result = _parse_json_response(response.choices[0].message.content or "{}")
    result["tokens_used"] = response.usage.total_tokens if response.usage else 0
    return result


def _parse_json_response(text: str) -> dict:
    """Parse JSON from AI response, handling markdown code blocks."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        return {"error": "Failed to parse AI response", "raw": text[:500]}


async def analyze_setup_feedback(credential_type: str, user_message: str, has_screenshot: bool = False) -> dict:
    """AI agent that analyzes user feedback about setup issues and provides alternative solutions."""
    client = await get_openai_client()

    step_context = {
        "github": "GitHub Personal Access Token setup and repository connection. Common issues: token permissions, expired tokens, wrong repo URL, 2FA requirements, SSO restrictions.",
        "apple": "Apple Developer Account API Key setup (App Store Connect). Common issues: no Apple Developer Program membership ($99/year), wrong key permissions, .p8 file format, Key ID vs Issuer ID confusion, account not verified.",
        "google": "Google Play Console Service Account JSON setup. Common issues: service account not linked to Play Console, wrong permissions, API not enabled, JSON format errors, project billing not set up.",
        "ios_signing": "iOS Code Signing certificate (.p12) and provisioning profile setup. Common issues: expired certificate, wrong certificate type (development vs distribution), provisioning profile mismatch, Base64 encoding errors.",
        "android_signing": "Android Keystore setup for signing APKs/AABs. Common issues: lost keystore password, wrong key alias, keytool command errors, Base64 encoding issues.",
    }

    context = step_context.get(credential_type, "General credential setup")

    prompt = (
        "You are an expert technical support agent for Auto Launch, an app that automates publishing apps to App Store and Google Play.\n\n"
        f"The user is trying to set up: {credential_type}\n"
        f"Context: {context}\n"
        f"User reported issue: {user_message}\n"
        f"User attached a screenshot: {'Yes' if has_screenshot else 'No'}\n\n"
        "Provide a helpful, actionable response with:\n"
        '1. "diagnosis" - What is likely wrong (1-2 sentences)\n'
        '2. "solution" - Step-by-step fix (3-5 numbered steps)\n'
        '3. "alternative" - An alternative approach if the main solution doesn\'t work\n'
        '4. "helpful_link" - A direct URL to the most relevant help page\n'
        '5. "helpful_link_label" - Label for the link\n\n'
        'Return JSON: {"diagnosis": "...", "solution": ["step1", "step2", ...], "alternative": "...", "helpful_link": "...", "helpful_link_label": "..."}\n'
        "Be specific and practical. Return ONLY valid JSON."
    )

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Expert tech support agent. Return only valid JSON. Be specific and actionable."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.5, max_tokens=1000,
    )

    result = _parse_json_response(response.choices[0].message.content or "{}")
    result["tokens_used"] = response.usage.total_tokens if response.usage else 0
    return result


def get_questionnaire_questions() -> list:
    return QUESTIONNAIRE_QUESTIONS
