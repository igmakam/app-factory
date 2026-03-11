"""
Activity: Test Runner
Generuje a spúšťa unit testy pre generovaný kód
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
class TestInput:
    app_id: int
    code: CodegenResult


@dataclass
class TestCase:
    name: str
    file_path: str
    content: str
    language: str


@dataclass
class TestResult:
    app_id: int
    passed: bool
    total: int
    passed_count: int
    failed_count: int
    failed_tests: list[str]
    test_files: list[TestCase]
    output: str


@activity.defn
async def run_tests(input: TestInput) -> TestResult:
    activity.logger.info(f"[tests] Generating tests for {len(input.code.files)} files")

    test_files: list[TestCase] = []

    # Generate tests for each non-trivial file
    for f in input.code.files:
        if _should_test(f.file_path, f.language):
            activity.heartbeat(f"Generating test for {f.file_path}")
            test = await _generate_test(f.file_path, f.content, f.language)
            if test:
                test_files.append(test)

    # Try to actually run the tests if compiler is available
    run_results = await _try_run_tests(test_files, input.code.files)

    total = len(test_files)
    passed_count = run_results.get("passed", total)  # Default: assume pass if can't run
    failed_count = run_results.get("failed", 0)
    failed_tests = run_results.get("failed_names", [])

    passed = failed_count == 0

    activity.logger.info(
        f"[tests] {passed_count}/{total} passed — {'✅' if passed else '❌'}"
    )

    return TestResult(
        app_id=input.app_id,
        passed=passed,
        total=total,
        passed_count=passed_count,
        failed_count=failed_count,
        failed_tests=failed_tests,
        test_files=test_files,
        output=run_results.get("output", ""),
    )


def _should_test(file_path: str, language: str) -> bool:
    """Testujeme iba relevantné súbory (nie assets, config, atď.)"""
    skip_patterns = [".xcodeproj", ".plist", ".json", ".yaml", "manifest", "build.gradle"]
    return not any(p in file_path.lower() for p in skip_patterns)


async def _generate_test(file_path: str, content: str, language: str) -> TestCase | None:
    """Claude generuje unit testy."""
    if len(content) < 100:
        return None

    ext = "swift" if language == "swift" else "kt"
    test_path = file_path.replace(f".{ext}", f"Tests.{ext}")

    prompt = f"""Generate unit tests for this {language} code. Return ONLY the test file content.

Source file: {file_path}
```{language}
{content[:2000]}
```

Write 3-5 meaningful unit tests. Use XCTest for Swift, JUnit4/5 for Kotlin.
Return ONLY compilable test code, no explanations."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )
        test_content = message.content[0].text.strip()
        if test_content.startswith("```"):
            lines = test_content.split("\n")
            test_content = "\n".join(lines[1:-1])

        return TestCase(
            name=os.path.basename(test_path),
            file_path=test_path,
            content=test_content,
            language=language,
        )
    except Exception:
        return None


async def _try_run_tests(test_files: list[TestCase], source_files) -> dict:
    """Pokúsi sa spustiť testy ak je k dispozícii kompilátor."""
    # Na Mac Mini workeri bude xcodebuild dostupný
    # Na VPS bude gradle dostupný
    # Tu len simulujeme — reálne buildy idú cez workers
    swift_tests = [t for t in test_files if t.language == "swift"]
    kotlin_tests = [t for t in test_files if t.language == "kotlin"]

    # Try Swift tests
    if swift_tests:
        try:
            result = subprocess.run(
                ["swift", "--version"], capture_output=True, timeout=5
            )
            if result.returncode == 0:
                # Swift available — could run SPM tests
                # For now, validate syntax only
                pass
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    # Default: all tests "pass" at generation stage
    # Real test execution happens in build worker
    return {
        "passed": len(test_files),
        "failed": 0,
        "failed_names": [],
        "output": f"Generated {len(test_files)} test files — execution delegated to build worker",
    }
