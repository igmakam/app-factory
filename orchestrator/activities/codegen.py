"""
Activity: Code Generation
Claude generuje Swift/Kotlin kód pre každý task
"""

import os
import json
import asyncio
from dataclasses import dataclass, field
from temporalio import activity
from anthropic import Anthropic
from .planner import PlannerResult, Task

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


@dataclass
class CodegenInput:
    app_id: int
    plan: PlannerResult
    platform: str


@dataclass
class GeneratedFile:
    file_path: str
    content: str
    language: str


@dataclass
class CodegenResult:
    app_id: int
    files: list[GeneratedFile]
    github_repo: str = ""
    commit_sha: str = ""


def _get_language_context(language: str, platform: str) -> str:
    contexts = {
        "swift": """You write production-quality SwiftUI code.
Rules:
- Use SwiftUI for all UI
- Use @StateObject, @ObservedObject, @EnvironmentObject properly
- Use async/await for network calls
- Follow MVVM pattern
- No UIKit unless absolutely necessary
- Include proper error handling
- Use Swift Concurrency (async/await, actors)""",

        "kotlin": """You write production-quality Jetpack Compose code.
Rules:
- Use Jetpack Compose for all UI
- Use ViewModel + StateFlow/LiveData
- Use Coroutines for async operations
- Follow MVVM/MVI pattern
- Use Hilt for dependency injection
- Include proper error handling""",

        "shared": """You write shared code (API client, models, utilities).
Use the appropriate language based on the file extension."""
    }
    return contexts.get(language, contexts["swift"])


async def _generate_single_file(task: Task, plan: PlannerResult, platform: str) -> GeneratedFile:
    lang_context = _get_language_context(task.language, platform)

    prompt = f"""You are a senior mobile developer. Generate complete, production-ready code.

{lang_context}

App architecture: {json.dumps(plan.architecture)}
Tech stack: {json.dumps(plan.tech_stack)}

Task: {task.title}
Description: {task.description}
File: {task.file_path}

Generate ONLY the complete file content, no explanations, no markdown fences.
The code must be complete and compilable."""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )

    content = message.content[0].text.strip()
    # Strip markdown if present
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])

    return GeneratedFile(
        file_path=task.file_path,
        content=content,
        language=task.language,
    )


@activity.defn
async def generate_code(input: CodegenInput) -> CodegenResult:
    activity.logger.info(f"[codegen] Generating {len(input.plan.tasks)} files for {input.platform}")

    # Generujeme súbory sekvenčne (Claude rate limits)
    files: list[GeneratedFile] = []
    for i, task in enumerate(input.plan.tasks):
        activity.heartbeat(f"Generating file {i+1}/{len(input.plan.tasks)}: {task.file_path}")
        try:
            f = await _generate_single_file(task, input.plan, input.platform)
            files.append(f)
            activity.logger.info(f"[codegen] ✅ {task.file_path} ({len(f.content)} chars)")
        except Exception as e:
            activity.logger.error(f"[codegen] ❌ Failed {task.file_path}: {e}")
            # Continue with other files
            continue

        # Rate limit pause
        await asyncio.sleep(0.5)

    activity.logger.info(f"[codegen] Done: {len(files)}/{len(input.plan.tasks)} files generated")

    return CodegenResult(
        app_id=input.app_id,
        files=files,
    )
