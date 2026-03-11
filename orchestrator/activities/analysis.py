"""
Activity: Static Analysis
Kontrola chýb v generovanom kóde pred testami
"""

import os
import json
import subprocess
import tempfile
from dataclasses import dataclass, field
from temporalio import activity
from anthropic import Anthropic
from .codegen import CodegenResult

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


@dataclass
class AnalysisInput:
    app_id: int
    code: CodegenResult


@dataclass
class AnalysisIssue:
    file_path: str
    line: int
    severity: str  # error | warning | info
    message: str
    suggestion: str


@dataclass
class AnalysisResult:
    app_id: int
    passed: bool
    error_count: int
    warning_count: int
    issues: list[AnalysisIssue]
    summary: str


@activity.defn
async def run_static_analysis(input: AnalysisInput) -> AnalysisResult:
    activity.logger.info(f"[analysis] Analyzing {len(input.code.files)} files")

    all_issues: list[AnalysisIssue] = []

    # 1. AI-based code review
    for f in input.code.files:
        activity.heartbeat(f"Analyzing {f.file_path}")
        issues = await _ai_review_file(f.file_path, f.content, f.language)
        all_issues.extend(issues)

    # 2. SwiftLint for Swift files (if available)
    swift_files = [f for f in input.code.files if f.language == "swift"]
    if swift_files:
        lint_issues = _run_swiftlint(swift_files)
        all_issues.extend(lint_issues)

    error_count = sum(1 for i in all_issues if i.severity == "error")
    warning_count = sum(1 for i in all_issues if i.severity == "warning")

    passed = error_count == 0

    summary = f"{error_count} errors, {warning_count} warnings in {len(input.code.files)} files"
    activity.logger.info(f"[analysis] {summary} — {'✅ PASS' if passed else '❌ FAIL'}")

    return AnalysisResult(
        app_id=input.app_id,
        passed=passed,
        error_count=error_count,
        warning_count=warning_count,
        issues=all_issues,
        summary=summary,
    )


async def _ai_review_file(file_path: str, content: str, language: str) -> list[AnalysisIssue]:
    """Claude reviewuje kód na kritické chyby."""
    if len(content) < 50:
        return []

    prompt = f"""Review this {language} code for critical errors only. Return JSON array of issues.

File: {file_path}
```{language}
{content[:3000]}
```

Return ONLY valid JSON array (empty array if no issues):
[
  {{
    "line": 15,
    "severity": "error",
    "message": "Missing import statement",
    "suggestion": "Add: import SwiftUI"
  }}
]

Only report: syntax errors, undefined symbols, type mismatches, missing imports.
Skip style issues and warnings."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()

        data = json.loads(raw)
        return [
            AnalysisIssue(
                file_path=file_path,
                line=item.get("line", 0),
                severity=item.get("severity", "error"),
                message=item.get("message", ""),
                suggestion=item.get("suggestion", ""),
            )
            for item in data
        ]
    except Exception:
        return []


def _run_swiftlint(swift_files) -> list[AnalysisIssue]:
    """Spustí SwiftLint ak je dostupný (Mac Mini worker)."""
    issues = []
    try:
        result = subprocess.run(
            ["swiftlint", "--version"],
            capture_output=True, timeout=5
        )
        if result.returncode != 0:
            return []

        with tempfile.TemporaryDirectory() as tmpdir:
            for f in swift_files:
                path = os.path.join(tmpdir, os.path.basename(f.file_path))
                with open(path, "w") as fp:
                    fp.write(f.content)

            result = subprocess.run(
                ["swiftlint", "lint", "--path", tmpdir, "--reporter", "json"],
                capture_output=True, text=True, timeout=30
            )
            if result.stdout:
                lint_data = json.loads(result.stdout)
                for item in lint_data:
                    issues.append(AnalysisIssue(
                        file_path=item.get("file", ""),
                        line=item.get("line", 0),
                        severity="error" if item.get("severity") == "error" else "warning",
                        message=item.get("reason", ""),
                        suggestion="",
                    ))
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return issues
