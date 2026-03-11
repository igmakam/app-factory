"""HELIXA AI Engine - Voice Idea Capture & Scoring System.
Handles idea structuring, scoring, valuation, build brief, autonomy analysis, synthesis, and experimental generation.
"""
import os
import json
from openai import AsyncOpenAI

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


async def get_openai_client() -> AsyncOpenAI:
    key = OPENAI_API_KEY
    if not key:
        from app.database import DATABASE_URL as DATABASE_PATH
        env_path = ".env"
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("OPENAI_API_KEY="):
                        key = line.strip().split("=", 1)[1]
    return AsyncOpenAI(api_key=key)


def _parse_json(text: str) -> dict:
    """Parse JSON from AI response, handling markdown code blocks."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
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
        return {}


async def structure_idea(raw_text: str) -> dict:
    """Step 1: Structure raw idea into business concept."""
    client = await get_openai_client()
    prompt = f'''You are an expert business analyst. Given the following raw idea description,
extract and generate a structured Idea Profile. Be creative and thorough.

Raw Idea:
"{raw_text}"

Return a JSON object with these exact keys:
- "idea_name": A catchy, descriptive name for the idea
- "product_type": One of: "SaaS", "Marketplace", "Tool", "Platform", "Infra", "Other"
- "problem_statement": The problem this solves (2-3 sentences)
- "proposed_solution": How the product solves it (2-3 sentences)
- "target_users": Who would use this (specific user segments, as a plain string)
- "use_case": Primary use case description
- "monetization_model": How this makes money (e.g., subscription, freemium, commission)
- "core_value_proposition": The key value in one sentence

Return ONLY valid JSON, no markdown or explanation.'''

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "Expert business analyst. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7, max_tokens=1500,
    )
    return _parse_json(response.choices[0].message.content or "{}")


async def score_idea(structured: dict) -> dict:
    """Step 2: Score idea on 6 dimensions with weighted formula."""
    client = await get_openai_client()
    prompt = f'''You are a venture capital analyst. Score this business idea on each dimension from 0 to 10.
Be realistic and critical.

Idea: {json.dumps(structured)}

Use the following WEIGHTS to calculate the overall_score (weighted average):
- viability_score: weight 25% - Is this realistically buildable and usable
- competition_density: weight 15% - Market saturation level (0=saturated, 10=blue ocean)
- market_demand: weight 25% - Likelihood of real need
- build_complexity: weight 10% - Ease of building (0=very hard, 10=very easy)
- monetization_strength: weight 15% - Revenue potential
- scalability: weight 10% - Ability to grow

Return a JSON object with:
- "viability_score": 0-10
- "competition_density": 0-10
- "market_demand": 0-10
- "build_complexity": 0-10
- "monetization_strength": 0-10
- "scalability": 0-10
- "overall_score": Weighted average using the weights above (0-10, one decimal)
- "scoring_notes": Brief explanation for each score (object with same keys, string values)
- "methodology": Object with:
  - "weights": Object mapping each score name to its weight percentage
  - "weight_rationale": Object mapping each score name to WHY this weight was chosen
  - "overall_formula": The exact formula used as a string
  - "scoring_criteria": Object mapping each score name to description of what 0, 5, and 10 mean

Return ONLY valid JSON, no markdown or explanation.'''

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "VC analyst. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.5, max_tokens=2000,
    )
    return _parse_json(response.choices[0].message.content or "{}")


async def valuate_idea(structured: dict) -> dict:
    """Step 3: Professional multi-method valuation."""
    client = await get_openai_client()
    prompt = f'''You are a senior startup valuation analyst at a top-tier VC firm (Sequoia/a16z level).
Perform a PROFESSIONAL multi-method valuation of this early-stage business idea.

Idea: {json.dumps(structured)}

You MUST apply these 4 valuation methods and return results for each:

=== METHOD 1: REVENUE MULTIPLES (EV/Revenue) ===
Determine realistic ARPU, use market-appropriate EV/Revenue multiples. Calculate for 3 scenarios (Conservative, Base Case, Optimistic) at Year 3.

=== METHOD 2: COMPARABLE COMPANY ANALYSIS ===
Name 2-3 REAL comparable companies with actual valuations. Apply early-stage discount (60-80%).

=== METHOD 3: BERKUS METHOD (Pre-Revenue) ===
Assign $0-500K to: Sound Idea, Prototype/Technology, Quality Management, Strategic Relationships, Product Rollout/Sales. Max $2.5M.

=== METHOD 4: SCORECARD METHOD ===
Start with average pre-money for similar stage. Adjust using 7 factors.

=== UNIT ECONOMICS ===
ARPU, CAC, LTV, LTV/CAC Ratio, Gross Margin %, Payback period.

Return JSON with: summary (range_low, range_high, recommended, confidence, stage), revenue_multiples, comparable_companies, berkus_method, scorecard_method, unit_economics, methodology_note, risk_factors[], upside_catalysts[]

Be realistic. Use real market data from 2024-2026.
Return ONLY valid JSON.'''

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "Senior VC valuation analyst. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.5, max_tokens=4000,
    )
    return _parse_json(response.choices[0].message.content or "{}")


async def generate_build_brief(structured: dict) -> dict:
    """Step 4: Generate complete Devin Build Brief."""
    client = await get_openai_client()
    prompt = f'''You are a senior product manager and technical architect. Generate a complete
"DEVIN BUILD BRIEF" for this idea that is ready to be copy-pasted and used to build the product.

Idea: {json.dumps(structured)}

Return a JSON object with:
- "product_name": Name of the product
- "problem": Clear problem statement
- "solution": How it solves the problem
- "target_users": Detailed user personas (single string, NOT array)
- "core_features": Array of 5-8 core features (strings)
- "mvp_scope": Array of 3-5 MVP items (strings)
- "suggested_tech_stack": Object with "frontend", "backend", "database", "ai", "infra" keys (string values)
- "basic_user_flow": Array of 5-8 step strings
- "monetization_model": Detailed monetization strategy (string)
- "expansion_potential": Array of 3-5 future expansion ideas (strings)

Return ONLY valid JSON, no markdown or explanation.'''

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "Senior PM and architect. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7, max_tokens=2000,
    )
    return _parse_json(response.choices[0].message.content or "{}")


async def analyze_autonomy(structured: dict, build_brief: dict) -> dict:
    """Step 5: Analyze AI autonomy - what Devin can build vs what needs human."""
    client = await get_openai_client()
    prompt = f'''You are Devin, an autonomous AI software engineer. You are evaluating whether YOU can build this product autonomously.

Analyze this project idea and its build brief. For each area, score from 0-10 how autonomously you (Devin AI) can handle it WITHOUT human intervention.

Idea: {json.dumps(structured)}
Build Brief: {json.dumps(build_brief)}

Return a JSON object with:
- "autonomy_score": Overall autonomy score 0-10
- "feasibility_verdict": One of: "Fully Autonomous", "Mostly Autonomous", "Partially Autonomous", "Requires Significant Human Input", "Not Feasible for AI"
- "confidence_level": 0-10
- "capabilities": Array of objects with: area, score (0-10), status ("can_do"/"partial"/"needs_human"), detail
- "what_devin_can_do": Array of strings
- "what_devin_cannot_do": Array of strings
- "what_user_must_do": Array of strings
- "estimated_build_time": String
- "risk_factors": Array of strings
- "recommendation": 2-3 sentence recommendation

Be honest and realistic. Return ONLY valid JSON.'''

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "AI engineer evaluating build feasibility. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.5, max_tokens=2000,
    )
    return _parse_json(response.choices[0].message.content or "{}")


async def process_idea(raw_text: str) -> dict:
    """Full pipeline: structure -> score -> valuate -> build brief -> autonomy."""
    structured = await structure_idea(raw_text)
    scores = await score_idea(structured)
    valuation = await valuate_idea(structured)
    build_brief = await generate_build_brief(structured)
    autonomy = await analyze_autonomy(structured, build_brief)
    return {
        "structured_idea": structured,
        "scores": scores,
        "valuation": valuation,
        "build_brief": build_brief,
        "autonomy": autonomy,
        "idea_name": structured.get("idea_name", "Untitled"),
        "product_type": structured.get("product_type", "Other"),
        "overall_score": scores.get("overall_score", 0),
    }


async def synthesize_ideas(ideas_summary: list) -> list:
    """Generate 2-3 hybrid ideas from existing ideas."""
    client = await get_openai_client()
    prompt = f'''You are a creative innovation strategist. You have access to the following business ideas:

{json.dumps(ideas_summary)}

Generate 2-3 NEW hybrid/combined ideas by creatively combining elements from 2+ existing ideas.

For each, return:
- "title", "description" (2-3 sentences)
- "source_idea_ids": Array of source idea IDs
- "source_idea_names": Array of source idea names
- "concept": {{"problem", "solution", "target_users", "product_type", "monetization", "unique_angle", "estimated_potential"}}

Return JSON with key "synthesized" containing array.
Return ONLY valid JSON.'''

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "Creative innovation strategist. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.8, max_tokens=3000,
    )
    result = _parse_json(response.choices[0].message.content or "{}")
    return result.get("synthesized", [])


async def refine_synthesis(synthesis: dict, comment: str) -> dict:
    """Refine a synthesized idea based on user feedback."""
    client = await get_openai_client()
    prompt = f'''You are a creative innovation strategist. A user has reviewed a synthesized idea and provided feedback.

Original: {json.dumps(synthesis)}
User feedback: "{comment}"

Revise the idea based on feedback. Return JSON with: title, description, concept (same keys as original: problem, solution, target_users, product_type, monetization, unique_angle, estimated_potential), revision_note.
Return ONLY valid JSON.'''

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "Creative strategist. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7, max_tokens=2000,
    )
    return _parse_json(response.choices[0].message.content or "{}")


async def generate_experimental_idea(generation_number: int, learning_context: str) -> dict:
    """Generate one brilliant experimental idea scoring 8+."""
    client = await get_openai_client()
    prompt = f'''You are an elite startup idea generator. Generate ONE brilliant app/SaaS idea scoring 8.0+.

Generation #{generation_number}. {learning_context}

Scoring weights: Viability 25%, Market Demand 25%, Competition 15%, Monetization 15%, Build Complexity 10%, Scalability 10%

To score 8+:
- Solve a REAL, painful problem many people have RIGHT NOW
- Clear, proven monetization (subscription, B2B SaaS preferred)
- Growing demand but not saturated market
- Buildable as MVP by single developer in days
- Strong network effects or switching costs

Return JSON with: idea_name, product_type, description, structured_idea (full profile with idea_name, product_type, problem_statement, proposed_solution, target_users, use_case, monetization_model, core_value_proposition), learning_note
Return ONLY valid JSON.'''

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": "Elite idea generator. Return only valid JSON."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.85, max_tokens=2000,
    )
    result = _parse_json(response.choices[0].message.content or "{}")

    # Score the generated idea
    structured = result.get("structured_idea", {})
    if structured:
        scores = await score_idea(structured)
        result["scores"] = scores
        result["overall_score"] = scores.get("overall_score", 0)

    return result


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio using Whisper."""
    client = await get_openai_client()
    import tempfile
    suffix = "." + filename.rsplit(".", 1)[-1] if "." in filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as audio_file:
            transcript = await client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
            )
        return transcript.text
    finally:
        os.unlink(tmp_path)
