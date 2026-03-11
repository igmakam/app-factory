"""
Activity: Fix Loop
Claude opravuje chyby z analýzy a failujúce testy (max 3 pokusy)
"""

import os
import json
from dataclasses import dataclass
from temporalio import activity
from anthropic import Anthropic
from .codegen import CodegenResult, GeneratedFile
from .analysis import AnalysisResult
from .tests import TestResult

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


@dataclass
class FixInput:
    app_id: int
    code: CodegenResult
    analysis: AnalysisResult
    test_result: TestResult
    attempt: int


@dataclass
class FixResult:
    app_id: int
    code: CodegenResult
    fixed_files: int
    changes_made: list[str]


@activity.defn
async def fix_code(input: FixInput) -> FixResult:
    activity.logger.info(
        f"[fix_loop] Attempt {input.attempt}/{3} — "
        f"{input.analysis.error_count} errors, "
        f"{input.test_result.failed_count} failing tests"
    )

    # Zozbieraj všetky problémy
    problems = []

    # Chyby z analýzy
    for issue in input.analysis.issues:
        if issue.severity == "error":
            problems.append({
                "type": "analysis",
                "file": issue.file_path,
                "line": issue.line,
                "message": issue.message,
                "suggestion": issue.suggestion,
            })

    # Failujúce testy
    for test_name in input.test_result.failed_tests:
        problems.append({
            "type": "test",
            "test": test_name,
            "message": f"Test '{test_name}' is failing",
        })

    if not problems:
        activity.logger.info("[fix_loop] No problems to fix")
        return FixResult(
            app_id=input.app_id,
            code=input.code,
            fixed_files=0,
            changes_made=[],
        )

    # Identifikuj súbory ktoré treba opraviť
    files_to_fix = set()
    for p in problems:
        if "file" in p:
            files_to_fix.add(p["file"])

    fixed_files_map = {f.file_path: f for f in input.code.files}
    changes_made = []
    fixed_count = 0

    for file_path in files_to_fix:
        if file_path not in fixed_files_map:
            continue

        original = fixed_files_map[file_path]
        file_problems = [p for p in problems if p.get("file") == file_path]

        activity.heartbeat(f"Fixing {file_path} ({len(file_problems)} issues)")

        fixed_content = await _fix_file(
            file_path=file_path,
            content=original.content,
            language=original.language,
            problems=file_problems,
        )

        if fixed_content and fixed_content != original.content:
            fixed_files_map[file_path] = GeneratedFile(
                file_path=file_path,
                content=fixed_content,
                language=original.language,
            )
            changes_made.append(f"Fixed {file_path}: {len(file_problems)} issues resolved")
            fixed_count += 1

    new_files = list(fixed_files_map.values())
    new_code = CodegenResult(
        app_id=input.code.app_id,
        files=new_files,
        github_repo=input.code.github_repo,
        commit_sha=input.code.commit_sha,
    )

    activity.logger.info(f"[fix_loop] Fixed {fixed_count} files")

    return FixResult(
        app_id=input.app_id,
        code=new_code,
        fixed_files=fixed_count,
        changes_made=changes_made,
    )


async def _fix_file(file_path: str, content: str, language: str, problems: list[dict]) -> str:
    """Claude opraví konkrétny súbor."""
    problems_text = "\n".join([
        f"- Line {p.get('line', '?')}: {p['message']}"
        + (f"\n  Suggestion: {p['suggestion']}" if p.get('suggestion') else "")
        for p in problems
    ])

    prompt = f"""Fix the following issues in this {language} file. Return ONLY the corrected file content.

File: {file_path}

Issues to fix:
{problems_text}

Original code:
```{language}
{content[:4000]}
```

Return ONLY the complete corrected file content, no explanations."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        fixed = message.content[0].text.strip()
        if fixed.startswith("```"):
            lines = fixed.split("\n")
            fixed = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])
        return fixed
    except Exception as e:
        activity.logger.error(f"[fix_loop] Failed to fix {file_path}: {e}")
        return content
