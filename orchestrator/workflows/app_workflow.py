"""
AppWorkflow — Temporal workflow
Každá appka = jeden workflow inštancia.

Flow:
  idea → validate → plan → codegen → analyze → test → fix_loop
       → fastlane → store_submit → traffic → monetize → report
"""

from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from orchestrator.activities.idea import generate_idea, IdeaInput, IdeaResult
    from orchestrator.activities.validation import validate_market, ValidationInput, ValidationResult
    from orchestrator.activities.planner import plan_tasks, PlannerInput, PlannerResult
    from orchestrator.activities.codegen import generate_code, CodegenInput, CodegenResult
    from orchestrator.activities.analysis import run_static_analysis, AnalysisInput, AnalysisResult
    from orchestrator.activities.tests import run_tests, TestInput, TestResult
    from orchestrator.activities.fix_loop import fix_code, FixInput, FixResult
    from orchestrator.activities.store_submit import submit_to_stores, StoreInput, StoreResult
    from orchestrator.activities.listing_gen import generate_listing, ListingInput, ListingResult
    from orchestrator.activities.notify import send_notification, NotifyInput


RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=10),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=3,
)

MAX_FIX_ATTEMPTS = 3


@workflow.defn
class AppWorkflow:
    """
    Orchestruje celý lifecycle jednej appky od idey po monetizáciu.
    """

    def __init__(self):
        self.status = "starting"
        self.current_stage = "idle"
        self.app_id: int | None = None
        self.signals: list[dict] = []

    @workflow.signal
    async def user_signal(self, data: dict):
        """Príjma signály od používateľa (schválenia, komentáre, stop)."""
        self.signals.append(data)

    @workflow.query
    def get_status(self) -> dict:
        return {
            "status": self.status,
            "stage": self.current_stage,
            "app_id": self.app_id,
        }

    @workflow.run
    async def run(self, input: dict) -> dict:
        app_id = input.get("app_id")
        raw_idea = input.get("raw_idea", "")
        platform = input.get("platform", "both")
        self.app_id = app_id

        try:
            # ── STAGE 1: IDEA GENERATION ──────────────────────────────────
            self.current_stage = "idea"
            idea: IdeaResult = await workflow.execute_activity(
                generate_idea,
                IdeaInput(app_id=app_id, raw_input=raw_idea),
                start_to_close_timeout=timedelta(minutes=3),
                retry_policy=RETRY_POLICY,
            )

            # ── STAGE 2: MARKET VALIDATION ───────────────────────────────
            self.current_stage = "validation"
            validation: ValidationResult = await workflow.execute_activity(
                validate_market,
                ValidationInput(app_id=app_id, idea=idea),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=RETRY_POLICY,
            )

            if validation.score < 6.0:
                await self._notify(app_id, "warning",
                    f"Idea '{idea.idea_name}' má nízke skóre ({validation.score}/10). Pokračujem ale odporúčam review.")

            # ── STAGE 3: PLANNING ─────────────────────────────────────────
            self.current_stage = "planning"
            plan: PlannerResult = await workflow.execute_activity(
                plan_tasks,
                PlannerInput(app_id=app_id, idea=idea, validation=validation, platform=platform),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=RETRY_POLICY,
            )

            # ── STAGE 4: STORE LISTING GENERATION ────────────────────────
            self.current_stage = "listing"
            listing: ListingResult = await workflow.execute_activity(
                generate_listing,
                ListingInput(app_id=app_id, idea=idea, platform=platform),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=RETRY_POLICY,
            )

            # ── STAGE 5: CODE GENERATION ──────────────────────────────────
            self.current_stage = "codegen"
            code: CodegenResult = await workflow.execute_activity(
                generate_code,
                CodegenInput(app_id=app_id, plan=plan, platform=platform),
                start_to_close_timeout=timedelta(minutes=30),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )

            # ── STAGE 6: STATIC ANALYSIS ──────────────────────────────────
            self.current_stage = "analysis"
            analysis: AnalysisResult = await workflow.execute_activity(
                run_static_analysis,
                AnalysisInput(app_id=app_id, code=code),
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=RETRY_POLICY,
            )

            # ── STAGE 7: TEST + FIX LOOP ──────────────────────────────────
            self.current_stage = "testing"
            test_result: TestResult = await workflow.execute_activity(
                run_tests,
                TestInput(app_id=app_id, code=code),
                start_to_close_timeout=timedelta(minutes=15),
                retry_policy=RETRY_POLICY,
            )

            fix_attempts = 0
            while not test_result.passed and fix_attempts < MAX_FIX_ATTEMPTS:
                self.current_stage = f"fix_loop_{fix_attempts + 1}"
                fix_result: FixResult = await workflow.execute_activity(
                    fix_code,
                    FixInput(
                        app_id=app_id,
                        code=code,
                        analysis=analysis,
                        test_result=test_result,
                        attempt=fix_attempts + 1,
                    ),
                    start_to_close_timeout=timedelta(minutes=20),
                    retry_policy=RETRY_POLICY,
                )
                code = fix_result.code
                fix_attempts += 1

                test_result = await workflow.execute_activity(
                    run_tests,
                    TestInput(app_id=app_id, code=code),
                    start_to_close_timeout=timedelta(minutes=15),
                    retry_policy=RETRY_POLICY,
                )

            if not test_result.passed:
                await self._notify(app_id, "error",
                    f"⚠️ {idea.idea_name}: testy stále failing po {MAX_FIX_ATTEMPTS} pokusoch. Vyžaduje manuálny zásah.")
                self.status = "needs_attention"
                return {"status": "needs_attention", "app_id": app_id, "stage": "testing"}

            # ── STAGE 8: BUILD + SIGN (Fastlane) ─────────────────────────
            self.current_stage = "build"
            # Build sa spúšťa ako activity na príslušnom workeri (Mac Mini / VPS)
            # Worker routing cez Temporal task queues: "ios-worker" alebo "android-worker"
            from orchestrator.activities.build import run_build, BuildInput, BuildResult

            build: BuildResult = await workflow.execute_activity(
                run_build,
                BuildInput(app_id=app_id, code=code, platform=platform),
                task_queue="ios-worker" if platform == "ios" else "android-worker",
                start_to_close_timeout=timedelta(hours=1),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )

            # ── STAGE 9: STORE SUBMIT ─────────────────────────────────────
            self.current_stage = "store_submit"
            store: StoreResult = await workflow.execute_activity(
                submit_to_stores,
                StoreInput(app_id=app_id, build=build, listing=listing, platform=platform),
                start_to_close_timeout=timedelta(minutes=30),
                retry_policy=RETRY_POLICY,
            )

            # ── DONE ──────────────────────────────────────────────────────
            self.status = "completed"
            self.current_stage = "done"

            await self._notify(app_id, "success",
                f"✅ {idea.idea_name} — submitted!\n"
                f"📱 Platform: {platform}\n"
                f"🏪 Store: {store.submission_url}\n"
                f"📊 ASO score: {listing.aso_score}/100"
            )

            return {
                "status": "completed",
                "app_id": app_id,
                "idea": idea.__dict__,
                "listing": listing.__dict__,
                "store": store.__dict__,
            }

        except Exception as e:
            self.status = "failed"
            await self._notify(app_id, "error", f"❌ Pipeline failed at {self.current_stage}: {str(e)}")
            raise

    async def _notify(self, app_id: int, type: str, message: str):
        await workflow.execute_activity(
            send_notification,
            NotifyInput(app_id=app_id, type=type, message=message),
            start_to_close_timeout=timedelta(seconds=30),
        )
