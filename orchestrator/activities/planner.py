"""
Activity: Planner
Claude rozloží appku na konkrétne dev tasky
"""

import os
import json
from dataclasses import dataclass, field
from temporalio import activity
from anthropic import Anthropic
from .idea import IdeaResult
from .validation import ValidationResult

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


@dataclass
class PlannerInput:
    app_id: int
    idea: IdeaResult
    validation: ValidationResult
    platform: str  # "ios" | "android" | "both"


@dataclass
class Task:
    id: str
    title: str
    description: str
    file_path: str
    language: str  # swift | kotlin | shared
    dependencies: list[str] = field(default_factory=list)
    priority: int = 1


@dataclass
class PlannerResult:
    app_id: int
    tasks: list[Task]
    architecture: dict
    file_structure: dict
    estimated_files: int
    tech_stack: dict


@activity.defn
async def plan_tasks(input: PlannerInput) -> PlannerResult:
    activity.logger.info(f"[planner] Planning: {input.idea.idea_name} for {input.platform}")

    idea = input.idea
    validation = input.validation
    build_brief = idea.build_brief
    platform = input.platform

    lang_note = ""
    if platform == "ios":
        lang_note = "Use SwiftUI for iOS only."
    elif platform == "android":
        lang_note = "Use Jetpack Compose for Android only."
    else:
        lang_note = "Build both iOS (SwiftUI) and Android (Jetpack Compose) sharing the same backend."

    prompt = f"""You are a senior mobile app architect. Create a detailed development plan for this app.

App: {idea.idea_name}
Type: {idea.product_type}
Features: {json.dumps(build_brief.get('core_features', []))}
MVP: {json.dumps(build_brief.get('mvp_scope', []))}
User flow: {json.dumps(build_brief.get('basic_user_flow', []))}
Keywords for ASO: {validation.aso_keywords}
{lang_note}

Return ONLY valid JSON:
{{
  "architecture": {{
    "pattern": "MVVM",
    "description": "..."
  }},
  "tech_stack": {{
    "ios": "SwiftUI + Combine",
    "android": "Jetpack Compose + Coroutines",
    "backend": "FastAPI + PostgreSQL",
    "shared": "REST API"
  }},
  "file_structure": {{
    "ios": ["App/", "Features/", "Models/", "Services/"],
    "android": ["app/src/main/java/com/app/", "ui/", "data/", "domain/"]
  }},
  "tasks": [
    {{
      "id": "task_001",
      "title": "Setup project structure",
      "description": "Initialize Xcode project with SwiftUI template",
      "file_path": "ios/AutoApp.xcodeproj",
      "language": "swift",
      "dependencies": [],
      "priority": 1
    }},
    {{
      "id": "task_002",
      "title": "Main view",
      "description": "Create main ContentView with navigation",
      "file_path": "ios/Features/Main/ContentView.swift",
      "language": "swift",
      "dependencies": ["task_001"],
      "priority": 2
    }}
  ]
}}

Create 8-15 tasks covering: project setup, models, views, services, API integration, tests.
"""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    data = json.loads(raw)

    tasks = [
        Task(
            id=t["id"],
            title=t["title"],
            description=t["description"],
            file_path=t["file_path"],
            language=t["language"],
            dependencies=t.get("dependencies", []),
            priority=t.get("priority", 1),
        )
        for t in data["tasks"]
    ]

    activity.logger.info(f"[planner] Created {len(tasks)} tasks")

    return PlannerResult(
        app_id=input.app_id,
        tasks=tasks,
        architecture=data["architecture"],
        file_structure=data["file_structure"],
        estimated_files=len(tasks),
        tech_stack=data["tech_stack"],
    )
