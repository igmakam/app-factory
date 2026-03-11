"""
Activity: Build (Fastlane)
Spúšťa sa NA WORKEROCH — Mac Mini M4 (iOS) alebo VPS (Android)
"""

import os
import json
import subprocess
import tempfile
import base64
from dataclasses import dataclass
from temporalio import activity
from .codegen import CodegenResult
from .store_submit import BuildResult


@dataclass
class BuildInput:
    app_id: int
    code: CodegenResult
    platform: str  # ios | android


@activity.defn
async def run_build(input: BuildInput) -> BuildResult:
    """
    Táto activity beží na Temporal workeri:
    - task_queue="ios-worker"  → Mac Mini M4
    - task_queue="android-worker" → Render/Hetzner VPS
    """
    activity.logger.info(f"[build] Starting {input.platform} build for app {input.app_id}")

    if input.platform == "ios":
        return await _build_ios(input)
    else:
        return await _build_android(input)


async def _build_ios(input: BuildInput) -> BuildResult:
    """iOS build cez Fastlane na Mac Mini M4."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write generated files
        _write_files(input.code.files, tmpdir)

        # Write Fastfile
        fastfile_content = _generate_ios_fastfile(input.app_id)
        fastlane_dir = os.path.join(tmpdir, "fastlane")
        os.makedirs(fastlane_dir, exist_ok=True)
        with open(os.path.join(fastlane_dir, "Fastfile"), "w") as f:
            f.write(fastfile_content)

        activity.heartbeat("Running fastlane build_and_upload_testflight")

        try:
            result = subprocess.run(
                ["fastlane", "build_and_upload_testflight"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=3600,  # 1 hour max
                env={
                    **os.environ,
                    "FASTLANE_HIDE_TIMESTAMP": "true",
                    "CI": "true",
                }
            )

            if result.returncode != 0:
                raise RuntimeError(f"Fastlane failed:\n{result.stderr[-2000:]}")

            activity.logger.info("[build] ✅ iOS build succeeded")
            return BuildResult(
                app_id=input.app_id,
                platform="ios",
                version="1.0.0",
                build_number=1,
            )

        except subprocess.TimeoutExpired:
            raise RuntimeError("iOS build timed out after 1 hour")


async def _build_android(input: BuildInput) -> BuildResult:
    """Android build cez Gradle + Fastlane na VPS."""
    with tempfile.TemporaryDirectory() as tmpdir:
        _write_files(input.code.files, tmpdir)

        fastfile_content = _generate_android_fastfile(input.app_id)
        fastlane_dir = os.path.join(tmpdir, "fastlane")
        os.makedirs(fastlane_dir, exist_ok=True)
        with open(os.path.join(fastlane_dir, "Fastfile"), "w") as f:
            f.write(fastfile_content)

        activity.heartbeat("Running fastlane build_and_upload_play_store")

        try:
            result = subprocess.run(
                ["fastlane", "build_and_upload_play_store"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=3600,
                env={**os.environ, "CI": "true"}
            )

            if result.returncode != 0:
                raise RuntimeError(f"Fastlane Android failed:\n{result.stderr[-2000:]}")

            activity.logger.info("[build] ✅ Android build succeeded")
            return BuildResult(
                app_id=input.app_id,
                platform="android",
                version="1.0.0",
                build_number=1,
            )

        except subprocess.TimeoutExpired:
            raise RuntimeError("Android build timed out after 1 hour")


def _write_files(files, base_dir: str):
    """Zapíše generované súbory do dočasného adresára."""
    for f in files:
        file_path = os.path.join(base_dir, f.file_path.lstrip("/"))
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w") as fp:
            fp.write(f.content)


def _generate_ios_fastfile(app_id: int) -> str:
    return f"""
default_platform(:ios)

platform :ios do
  desc "Build and upload to TestFlight"
  lane :build_and_upload_testflight do
    # Sync certificates via match
    match(type: "appstore", readonly: true)
    
    # Build
    build_app(
      scheme: "AutoApp",
      export_method: "app-store",
      clean: true
    )
    
    # Upload to TestFlight
    upload_to_testflight(
      skip_waiting_for_build_processing: true
    )
    
    # Notify
    puts "✅ iOS build uploaded to TestFlight (app_id: {app_id})"
  end
end
"""


def _generate_android_fastfile(app_id: int) -> str:
    return f"""
default_platform(:android)

platform :android do
  desc "Build and upload to Google Play"
  lane :build_and_upload_play_store do
    # Build release AAB
    gradle(
      task: "bundle",
      build_type: "Release",
      properties: {{
        "android.injected.signing.store.file" => ENV["KEYSTORE_PATH"],
        "android.injected.signing.store.password" => ENV["KEYSTORE_PASSWORD"],
        "android.injected.signing.key.alias" => ENV["KEY_ALIAS"],
        "android.injected.signing.key.password" => ENV["KEY_PASSWORD"],
      }}
    )
    
    # Upload to Google Play internal track
    upload_to_play_store(
      track: "internal",
      aab: lane_context[SharedValues::GRADLE_AAB_OUTPUT_PATH]
    )
    
    puts "✅ Android build uploaded to Play Store internal track (app_id: {app_id})"
  end
end
"""
