"""Browser automation agent for App Store Connect and Google Play Console.
System B fallback when API calls (System A) fail.
Uses Playwright for headless browser automation."""

import asyncio
import json
import logging
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger("browser_agent")


class BrowserAgent:
    """Base browser automation agent with Playwright."""

    def __init__(self):
        self.browser = None
        self.context = None
        self.page = None
        self.action_log: list = []
        self._playwright = None

    def log(self, action: str, detail: str = ""):
        entry = f"[Browser] {action}"
        if detail:
            entry += f": {detail}"
        self.action_log.append(entry)
        logger.info(entry)

    async def start(self, headless: bool = True) -> bool:
        """Launch browser instance."""
        try:
            from playwright.async_api import async_playwright
            self._playwright = await async_playwright().start()
            self.browser = await self._playwright.chromium.launch(headless=headless)
            self.context = await self.browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            self.page = await self.context.new_page()
            self.log("Browser started", "Chromium headless")
            return True
        except Exception as e:
            self.log("Browser start failed", str(e))
            return False

    async def stop(self):
        """Close browser and clean up."""
        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self._playwright:
                await self._playwright.stop()
            self.log("Browser stopped")
        except Exception as e:
            self.log("Browser stop error", str(e))

    async def screenshot(self, path: str = "/tmp/browser_screenshot.png") -> str:
        """Take screenshot for debugging."""
        if self.page:
            await self.page.screenshot(path=path)
            return path
        return ""

    async def wait_and_click(self, selector: str, timeout: int = 10000) -> bool:
        """Wait for element and click it."""
        try:
            await self.page.wait_for_selector(selector, timeout=timeout)
            await self.page.click(selector)
            self.log("Clicked", selector)
            return True
        except Exception as e:
            self.log("Click failed", f"{selector}: {str(e)}")
            return False

    async def wait_and_fill(self, selector: str, value: str, timeout: int = 10000) -> bool:
        """Wait for input and fill it."""
        try:
            await self.page.wait_for_selector(selector, timeout=timeout)
            await self.page.fill(selector, value)
            self.log("Filled", selector)
            return True
        except Exception as e:
            self.log("Fill failed", f"{selector}: {str(e)}")
            return False

    async def wait_for_navigation(self, timeout: int = 30000):
        """Wait for page navigation to complete."""
        try:
            await self.page.wait_for_load_state("networkidle", timeout=timeout)
        except Exception:
            await self.page.wait_for_load_state("domcontentloaded", timeout=timeout)

    async def get_page_text(self) -> str:
        """Get all visible text on the page."""
        try:
            return await self.page.inner_text("body")
        except Exception:
            return ""


class AppStoreConnectAgent(BrowserAgent):
    """Browser automation for App Store Connect."""

    BASE_URL = "https://appstoreconnect.apple.com"

    async def login(self, apple_id: str, password: str) -> dict:
        """Login to App Store Connect."""
        self.log("Navigating to App Store Connect")
        try:
            await self.page.goto(f"{self.BASE_URL}/login", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Apple uses an iframe for login
            iframe = self.page.frame_locator("iframe#aid-auth-widget-iFrame")

            # Enter Apple ID
            await iframe.locator("#account_name_text_field").fill(apple_id)
            await iframe.locator("#sign-in").click()
            await asyncio.sleep(2)

            # Enter password
            await iframe.locator("#password_text_field").fill(password)
            await iframe.locator("#sign-in").click()
            await asyncio.sleep(5)

            # Check if 2FA is required
            page_text = await self.get_page_text()
            if "verification" in page_text.lower() or "two-factor" in page_text.lower():
                self.log("2FA required", "User needs to provide verification code")
                return {
                    "success": False,
                    "needs_2fa": True,
                    "message": "Two-factor authentication required. Please provide the verification code sent to your device.",
                    "log": self.action_log,
                }

            # Verify login success
            await self.wait_for_navigation()
            current_url = self.page.url
            if "appstoreconnect.apple.com" in current_url and "login" not in current_url:
                self.log("Login successful")
                return {"success": True, "log": self.action_log}
            else:
                self.log("Login may have failed", f"Current URL: {current_url}")
                return {"success": False, "message": "Login did not complete. Check credentials.", "log": self.action_log}

        except Exception as e:
            self.log("Login error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}

    async def create_app(self, app_name: str, bundle_id: str, sku: str) -> dict:
        """Create a new app in App Store Connect via browser."""
        self.log("Creating new app", f"{app_name} ({bundle_id})")
        try:
            await self.page.goto(f"{self.BASE_URL}/apps", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Click "+" button to create new app
            plus_button = await self.page.query_selector('button[aria-label="Add"], a.add-button, [data-testid="add-app-button"]')
            if plus_button:
                await plus_button.click()
                await asyncio.sleep(2)

            # Fill in app details
            # Name field
            name_input = await self.page.query_selector('input[name="appName"], input[placeholder*="name" i]')
            if name_input:
                await name_input.fill(app_name)

            # Bundle ID - select from dropdown or enter
            bundle_select = await self.page.query_selector('select[name="bundleId"], [data-testid="bundle-id"]')
            if bundle_select:
                await bundle_select.select_option(value=bundle_id)

            # SKU
            sku_input = await self.page.query_selector('input[name="sku"], input[placeholder*="SKU" i]')
            if sku_input:
                await sku_input.fill(sku)

            # Submit
            create_btn = await self.page.query_selector('button:has-text("Create"), button[type="submit"]')
            if create_btn:
                await create_btn.click()
                await asyncio.sleep(5)

            page_text = await self.get_page_text()
            if "error" in page_text.lower():
                self.log("App creation may have errors", page_text[:200])
                return {"success": False, "message": f"Possible error during creation: {page_text[:200]}", "log": self.action_log}

            self.log("App creation initiated")
            return {"success": True, "message": "App creation initiated via browser", "log": self.action_log}

        except Exception as e:
            self.log("App creation error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}

    async def update_listing(self, app_name: str, listing_data: dict) -> dict:
        """Update app store listing via browser."""
        self.log("Updating store listing", app_name)
        try:
            # Navigate to the app's page
            await self.page.goto(f"{self.BASE_URL}/apps", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Find and click the app
            app_link = await self.page.query_selector(f'a:has-text("{app_name}")')
            if app_link:
                await app_link.click()
                await asyncio.sleep(3)

            # Navigate to App Information
            info_link = await self.page.query_selector('a:has-text("App Information"), [data-testid="app-info"]')
            if info_link:
                await info_link.click()
                await asyncio.sleep(2)

            # Fill in listing fields
            if listing_data.get("description"):
                desc_field = await self.page.query_selector('textarea[name="description"], [data-testid="description"]')
                if desc_field:
                    await desc_field.fill(listing_data["description"])

            if listing_data.get("keywords"):
                keywords_field = await self.page.query_selector('textarea[name="keywords"], input[name="keywords"]')
                if keywords_field:
                    await keywords_field.fill(listing_data["keywords"])

            if listing_data.get("whats_new"):
                whats_new_field = await self.page.query_selector('textarea[name="whatsNew"]')
                if whats_new_field:
                    await whats_new_field.fill(listing_data["whats_new"])

            # Save
            save_btn = await self.page.query_selector('button:has-text("Save")')
            if save_btn:
                await save_btn.click()
                await asyncio.sleep(3)

            self.log("Listing update completed")
            return {"success": True, "message": "Store listing updated via browser", "log": self.action_log}

        except Exception as e:
            self.log("Listing update error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}

    async def submit_for_review(self, app_name: str) -> dict:
        """Submit app for review via browser."""
        self.log("Submitting for review", app_name)
        try:
            # Navigate to app
            await self.page.goto(f"{self.BASE_URL}/apps", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            app_link = await self.page.query_selector(f'a:has-text("{app_name}")')
            if app_link:
                await app_link.click()
                await asyncio.sleep(3)

            # Click Submit for Review
            submit_btn = await self.page.query_selector('button:has-text("Submit for Review"), button:has-text("Add for Review")')
            if submit_btn:
                await submit_btn.click()
                await asyncio.sleep(3)

                # Confirm submission
                confirm_btn = await self.page.query_selector('button:has-text("Submit"), button:has-text("Confirm")')
                if confirm_btn:
                    await confirm_btn.click()
                    await asyncio.sleep(5)

            page_text = await self.get_page_text()
            if "waiting for review" in page_text.lower() or "in review" in page_text.lower():
                self.log("Submission successful")
                return {"success": True, "message": "App submitted for review", "log": self.action_log}

            self.log("Submission status unclear", page_text[:200])
            return {"success": True, "message": "Submit action completed via browser", "log": self.action_log}

        except Exception as e:
            self.log("Submit error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}


class GooglePlayConsoleAgent(BrowserAgent):
    """Browser automation for Google Play Console."""

    BASE_URL = "https://play.google.com/console"

    async def login(self, email: str, password: str) -> dict:
        """Login to Google Play Console."""
        self.log("Navigating to Google Play Console")
        try:
            await self.page.goto("https://accounts.google.com/signin", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Enter email
            await self.page.fill('input[type="email"]', email)
            await self.page.click('#identifierNext, button:has-text("Next")')
            await asyncio.sleep(3)

            # Enter password
            await self.page.fill('input[type="password"]', password)
            await self.page.click('#passwordNext, button:has-text("Next")')
            await asyncio.sleep(5)

            # Check for 2FA
            page_text = await self.get_page_text()
            if "2-step" in page_text.lower() or "verify" in page_text.lower():
                self.log("2FA required", "User needs to provide verification")
                return {
                    "success": False,
                    "needs_2fa": True,
                    "message": "Two-factor authentication required for Google account.",
                    "log": self.action_log,
                }

            # Navigate to Play Console
            await self.page.goto(self.BASE_URL, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            if "console" in self.page.url.lower():
                self.log("Login successful")
                return {"success": True, "log": self.action_log}
            else:
                return {"success": False, "message": "Could not reach Play Console", "log": self.action_log}

        except Exception as e:
            self.log("Login error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}

    async def create_app(self, app_name: str, package_name: str, language: str = "en-US") -> dict:
        """Create a new app in Google Play Console via browser."""
        self.log("Creating new app", f"{app_name} ({package_name})")
        try:
            await self.page.goto(f"{self.BASE_URL}/create-app", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Fill app name
            name_input = await self.page.query_selector('input[aria-label*="App name" i], input[name="appName"]')
            if name_input:
                await name_input.fill(app_name)

            # Select default language
            lang_select = await self.page.query_selector('select[aria-label*="language" i]')
            if lang_select:
                await lang_select.select_option(label=language)

            # App or game selection
            app_radio = await self.page.query_selector('input[value="APP"], label:has-text("App")')
            if app_radio:
                await app_radio.click()

            # Free or paid
            free_radio = await self.page.query_selector('input[value="FREE"], label:has-text("Free")')
            if free_radio:
                await free_radio.click()

            # Accept declarations
            checkboxes = await self.page.query_selector_all('input[type="checkbox"]')
            for cb in checkboxes:
                checked = await cb.is_checked()
                if not checked:
                    await cb.click()

            # Create app button
            create_btn = await self.page.query_selector('button:has-text("Create app")')
            if create_btn:
                await create_btn.click()
                await asyncio.sleep(5)

            self.log("App creation initiated")
            return {"success": True, "message": "App creation initiated via browser", "log": self.action_log}

        except Exception as e:
            self.log("App creation error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}

    async def update_listing(self, package_name: str, listing_data: dict) -> dict:
        """Update Google Play store listing via browser."""
        self.log("Updating store listing", package_name)
        try:
            # Navigate to store listing page
            # Google Play Console URL pattern: /console/developers/{dev_id}/app/{app_id}/store-listing
            await self.page.goto(self.BASE_URL, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Find the app in the list
            app_link = await self.page.query_selector(f'a:has-text("{listing_data.get("title", package_name)}")')
            if app_link:
                await app_link.click()
                await asyncio.sleep(3)

            # Navigate to Main store listing
            listing_link = await self.page.query_selector('a:has-text("Main store listing"), a:has-text("Store listing")')
            if listing_link:
                await listing_link.click()
                await asyncio.sleep(3)

            # Fill in fields
            if listing_data.get("title"):
                title_field = await self.page.query_selector('input[aria-label*="App name" i], input[name="title"]')
                if title_field:
                    await title_field.fill("")
                    await title_field.fill(listing_data["title"])

            if listing_data.get("subtitle"):
                short_desc = await self.page.query_selector('textarea[aria-label*="Short description" i], input[name="shortDescription"]')
                if short_desc:
                    await short_desc.fill("")
                    await short_desc.fill(listing_data["subtitle"])

            if listing_data.get("description"):
                full_desc = await self.page.query_selector('textarea[aria-label*="Full description" i], textarea[name="fullDescription"]')
                if full_desc:
                    await full_desc.fill("")
                    await full_desc.fill(listing_data["description"])

            # Save
            save_btn = await self.page.query_selector('button:has-text("Save")')
            if save_btn:
                await save_btn.click()
                await asyncio.sleep(3)

            self.log("Listing update completed")
            return {"success": True, "message": "Store listing updated via browser", "log": self.action_log}

        except Exception as e:
            self.log("Listing update error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}

    async def submit_for_review(self, package_name: str) -> dict:
        """Submit app for review on Google Play via browser."""
        self.log("Submitting for review", package_name)
        try:
            # Navigate to the app's publishing overview
            await self.page.goto(self.BASE_URL, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Find app
            app_link = await self.page.query_selector(f'tr:has-text("{package_name}") a, a:has-text("{package_name}")')
            if app_link:
                await app_link.click()
                await asyncio.sleep(3)

            # Go to Publishing overview
            pub_link = await self.page.query_selector('a:has-text("Publishing overview")')
            if pub_link:
                await pub_link.click()
                await asyncio.sleep(3)

            # Send for review
            review_btn = await self.page.query_selector('button:has-text("Send"), button:has-text("Submit"), button:has-text("Review")')
            if review_btn:
                await review_btn.click()
                await asyncio.sleep(5)

            self.log("Review submission completed")
            return {"success": True, "message": "App submitted for review via browser", "log": self.action_log}

        except Exception as e:
            self.log("Submit error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}


class GitHubAgent(BrowserAgent):
    """Browser automation for GitHub repository management."""

    async def login(self, username: str, token: str) -> dict:
        """Login to GitHub using token (via API header, not browser)."""
        self.log("Setting up GitHub browser session")
        try:
            await self.page.goto("https://github.com/login", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)

            await self.page.fill('#login_field', username)
            await self.page.fill('#password', token)
            await self.page.click('input[type="submit"], button:has-text("Sign in")')
            await asyncio.sleep(5)

            page_text = await self.get_page_text()
            if "two-factor" in page_text.lower() or "authentication code" in page_text.lower():
                return {
                    "success": False,
                    "needs_2fa": True,
                    "message": "GitHub 2FA required.",
                    "log": self.action_log,
                }

            if "github.com" in self.page.url and "login" not in self.page.url:
                self.log("GitHub login successful")
                return {"success": True, "log": self.action_log}

            return {"success": False, "message": "Login did not complete", "log": self.action_log}

        except Exception as e:
            self.log("GitHub login error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}

    async def enable_actions(self, owner: str, repo: str) -> dict:
        """Enable GitHub Actions for a repository via browser."""
        self.log("Enabling GitHub Actions", f"{owner}/{repo}")
        try:
            await self.page.goto(f"https://github.com/{owner}/{repo}/settings/actions",
                                 wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            # Select "Allow all actions"
            allow_all = await self.page.query_selector('input[value="all"], label:has-text("Allow all actions")')
            if allow_all:
                await allow_all.click()
                await asyncio.sleep(1)

            # Save
            save_btn = await self.page.query_selector('button:has-text("Save")')
            if save_btn:
                await save_btn.click()
                await asyncio.sleep(2)

            self.log("Actions enabled")
            return {"success": True, "message": "GitHub Actions enabled", "log": self.action_log}

        except Exception as e:
            self.log("Enable actions error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}

    async def add_secret(self, owner: str, repo: str, secret_name: str, secret_value: str) -> dict:
        """Add a repository secret via browser."""
        self.log("Adding repo secret", f"{owner}/{repo} - {secret_name}")
        try:
            await self.page.goto(f"https://github.com/{owner}/{repo}/settings/secrets/actions/new",
                                 wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)

            await self.page.fill('#secret_name, input[name="secret[name]"]', secret_name)
            await self.page.fill('#secret_value, textarea[name="secret[value]"]', secret_value)

            add_btn = await self.page.query_selector('button:has-text("Add secret")')
            if add_btn:
                await add_btn.click()
                await asyncio.sleep(3)

            self.log("Secret added", secret_name)
            return {"success": True, "message": f"Secret {secret_name} added", "log": self.action_log}

        except Exception as e:
            self.log("Add secret error", str(e))
            return {"success": False, "message": str(e), "log": self.action_log}


# ==================== DUAL SYSTEM ORCHESTRATOR ====================

class DualSystemOrchestrator:
    """Orchestrates System A (API) and System B (Browser) with System C (User notification) as last resort.
    Follows aviation-style redundancy: if primary fails, backup takes over seamlessly."""

    def __init__(self, credentials: dict, project: dict):
        self.credentials = credentials
        self.project = project
        self.system_log: list = []
        self.active_system = "A"  # Track which system is active

    def log(self, system: str, action: str, detail: str = ""):
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "system": system,
            "action": action,
            "detail": detail,
        }
        self.system_log.append(entry)
        logger.info(f"[System {system}] {action}: {detail}")

    def get_log_summary(self) -> str:
        """Get human-readable summary of system actions."""
        lines = []
        for entry in self.system_log:
            lines.append(f"[{entry['system']}] {entry['action']}" + (f": {entry['detail']}" if entry['detail'] else ""))
        return " | ".join(lines[-5:])  # Last 5 entries

    async def execute_with_fallback(self, step_name: str, api_func, browser_func, user_instruction: str) -> dict:
        """Execute a step with System A -> System B -> System C fallback.

        Args:
            step_name: Human-readable step name
            api_func: Async function for System A (API call)
            browser_func: Async function for System B (browser automation)
            user_instruction: Clear instruction for user if both systems fail (System C)

        Returns:
            dict with success, message, system_used, and log
        """
        error_a = "Not attempted"
        error_b = "Not attempted"

        # ========== SYSTEM A: API (with 10s timeout) ==========
        self.log("A", f"Attempting {step_name}", "API call")
        try:
            result_a = await asyncio.wait_for(api_func(), timeout=10.0)
            if result_a.get("success"):
                self.log("A", f"{step_name} completed", "API success")
                return {
                    "success": True,
                    "message": result_a.get("message", f"{step_name} completed via API"),
                    "system_used": "A (API)",
                    "log": self.get_log_summary(),
                }
            else:
                error_a = result_a.get("message", result_a.get("error", "Unknown API error"))
                self.log("A", f"{step_name} failed", error_a)
        except asyncio.TimeoutError:
            error_a = "API call timed out (10s)"
            self.log("A", f"{step_name} timed out", "10s limit reached")
        except Exception as e:
            error_a = str(e)
            self.log("A", f"{step_name} error", error_a)

        # ========== SYSTEM B: BROWSER AUTOMATION (with 10s timeout) ==========
        self.log("B", f"Attempting {step_name}", "Browser fallback")
        try:
            result_b = await asyncio.wait_for(browser_func(), timeout=10.0)
            if result_b.get("success"):
                self.log("B", f"{step_name} completed", "Browser success")
                return {
                    "success": True,
                    "message": result_b.get("message", f"{step_name} completed via browser automation"),
                    "system_used": "B (Browser)",
                    "log": self.get_log_summary(),
                }
            elif result_b.get("needs_2fa"):
                self.log("B", "2FA required", "Switching to System C")
                return {
                    "success": False,
                    "needs_user_action": True,
                    "message": result_b.get("message", "Two-factor authentication required"),
                    "user_instruction": f"2FA verification needed for {step_name}. {result_b.get('message', '')}",
                    "system_used": "C (User Action Required)",
                    "log": self.get_log_summary(),
                }
            else:
                error_b = result_b.get("message", "Browser automation failed")
                self.log("B", f"{step_name} failed", error_b)
        except asyncio.TimeoutError:
            error_b = "Browser automation timed out (10s)"
            self.log("B", f"{step_name} timed out", "10s limit reached")
        except Exception as e:
            error_b = str(e)
            self.log("B", f"{step_name} error", error_b)

        # ========== SYSTEM C: USER NOTIFICATION ==========
        self.log("C", f"{step_name} requires user action", user_instruction)
        return {
            "success": False,
            "needs_user_action": True,
            "message": f"Both automated systems failed for {step_name}.",
            "user_instruction": user_instruction,
            "system_a_error": error_a,
            "system_b_error": error_b,
            "system_used": "C (User Action Required)",
            "log": self.get_log_summary(),
        }

    async def build_app(self, platform: str, github_token: str, repo_url: str, signing_config: dict) -> dict:
        """Build app with dual-system fallback."""
        from .pipeline import trigger_github_action, check_github_action_status, PipelineFixer

        fixer = PipelineFixer(github_token, repo_url, self.credentials)
        default_branch = await fixer.get_default_branch() if repo_url and github_token else "main"

        async def api_build():
            result = await trigger_github_action(github_token, repo_url, platform, signing_config, default_branch)
            if not result.get("success"):
                # Try fixer first
                fix_result = await fixer.diagnose_and_fix(result.get("error", ""), f"build_{platform}", platform)
                if fix_result.get("fixed") and fix_result.get("retry"):
                    await asyncio.sleep(5)
                    result = await trigger_github_action(github_token, repo_url, platform, signing_config, default_branch)
            return result

        async def browser_build():
            # Browser fallback: navigate to GitHub Actions and manually trigger
            agent = GitHubAgent()
            started = await agent.start()
            if not started:
                return {"success": False, "message": "Could not start browser"}
            try:
                if repo_url:
                    owner, repo = repo_url.rstrip("/").rstrip(".git").split("/")[-2:]
                    await agent.page.goto(
                        f"https://github.com/{owner}/{repo}/actions/workflows/build.yml",
                        wait_until="networkidle", timeout=30000
                    )
                    await asyncio.sleep(3)

                    # Click "Run workflow" button
                    run_btn = await agent.page.query_selector('button:has-text("Run workflow")')
                    if run_btn:
                        await run_btn.click()
                        await asyncio.sleep(2)
                        # Click the green "Run workflow" confirm button
                        confirm_btn = await agent.page.query_selector('.actions-workflow-dispatch button.btn-primary')
                        if confirm_btn:
                            await confirm_btn.click()
                            await asyncio.sleep(5)
                            return {"success": True, "message": "Workflow triggered via browser"}

                return {"success": False, "message": "Could not trigger workflow via browser"}
            finally:
                await agent.stop()

        return await self.execute_with_fallback(
            f"Build {platform.upper()}",
            api_build,
            browser_build,
            f"Please manually trigger the build workflow in your GitHub repo for {platform}. "
            f"Go to your repo > Actions > Build workflow > Run workflow."
        )

    async def upload_to_store(self, platform: str, listing_data: dict) -> dict:
        """Upload to store with dual-system fallback."""

        async def api_upload():
            try:
                from .store_api import create_apple_client, create_google_client
            except Exception:
                return {"success": False, "message": "Store API module not available"}
            if platform == "ios":
                apple_creds = self.credentials.get("apple", {})
                if not apple_creds.get("key_id") or not apple_creds.get("private_key"):
                    return {"success": False, "message": "Apple API credentials incomplete"}
                client = create_apple_client(apple_creds)
                if not client:
                    return {"success": False, "message": "Could not create Apple API client"}
                result = await client.update_app_info(
                    self.project.get("apple_app_id", ""),
                    listing_data
                )
                return {"success": result.get("success", False), "message": result.get("message", result.get("error", ""))}
            else:
                google_creds = self.credentials.get("google", {})
                if not google_creds.get("client_email") and not google_creds.get("service_account_json"):
                    return {"success": False, "message": "Google API credentials incomplete"}
                client = create_google_client(google_creds)
                if not client:
                    return {"success": False, "message": "Could not create Google API client"}
                edit = await client.create_edit(self.project.get("bundle_id", ""))
                if not edit.get("success"):
                    return edit
                result = await client.update_listing(
                    self.project.get("bundle_id", ""),
                    edit["edit_id"],
                    listing_data
                )
                if result.get("success"):
                    await client.commit_edit(self.project.get("bundle_id", ""), edit["edit_id"])
                return {"success": result.get("success", False), "message": str(result.get("data", result.get("error", "")))}

        async def browser_upload():
            # Check if Playwright/Chromium is available before attempting
            try:
                from playwright.async_api import async_playwright
            except ImportError:
                return {"success": False, "message": "Playwright not installed on this server"}
            if platform == "ios":
                agent = AppStoreConnectAgent()
                started = await agent.start()
                if not started:
                    return {"success": False, "message": "Could not start browser"}
                try:
                    return await agent.update_listing(
                        self.project.get("name", ""),
                        listing_data
                    )
                finally:
                    await agent.stop()
            else:
                agent = GooglePlayConsoleAgent()
                started = await agent.start()
                if not started:
                    return {"success": False, "message": "Could not start browser"}
                try:
                    return await agent.update_listing(
                        self.project.get("bundle_id", ""),
                        listing_data
                    )
                finally:
                    await agent.stop()

        store_name = "App Store Connect" if platform == "ios" else "Google Play Console"
        return await self.execute_with_fallback(
            f"Upload to {store_name}",
            api_upload,
            browser_upload,
            f"Please manually update the store listing in {store_name} for {self.project.get('name', 'your app')}."
        )

    async def submit_for_review(self, platform: str) -> dict:
        """Submit for review with dual-system fallback."""

        async def api_submit():
            try:
                from .store_api import create_apple_client, create_google_client
            except Exception:
                return {"success": False, "message": "Store API module not available"}
            if platform == "ios":
                apple_creds = self.credentials.get("apple", {})
                if not apple_creds.get("key_id") or not apple_creds.get("private_key"):
                    return {"success": False, "message": "Apple API credentials incomplete"}
                client = create_apple_client(apple_creds)
                if not client:
                    return {"success": False, "message": "Could not create Apple API client"}
                result = await client.submit_for_review(
                    self.project.get("apple_app_id", ""),
                    self.project.get("apple_version_id", "")
                )
                return {"success": result.get("success", False), "message": str(result.get("data", result.get("error", "")))}
            else:
                google_creds = self.credentials.get("google", {})
                if not google_creds.get("client_email") and not google_creds.get("service_account_json"):
                    return {"success": False, "message": "Google API credentials incomplete"}
                client = create_google_client(google_creds)
                if not client:
                    return {"success": False, "message": "Could not create Google API client"}
                edit = await client.create_edit(self.project.get("bundle_id", ""))
                if edit.get("success"):
                    result = await client.commit_edit(self.project.get("bundle_id", ""), edit["edit_id"])
                    return {"success": result.get("success", False), "message": "Submitted via API"}
                return {"success": False, "message": "Could not create edit"}

        async def browser_submit():
            # Check if Playwright/Chromium is available before attempting
            try:
                from playwright.async_api import async_playwright
            except ImportError:
                return {"success": False, "message": "Playwright not installed on this server"}
            if platform == "ios":
                agent = AppStoreConnectAgent()
                started = await agent.start()
                if not started:
                    return {"success": False, "message": "Could not start browser"}
                try:
                    return await agent.submit_for_review(self.project.get("name", ""))
                finally:
                    await agent.stop()
            else:
                agent = GooglePlayConsoleAgent()
                started = await agent.start()
                if not started:
                    return {"success": False, "message": "Could not start browser"}
                try:
                    return await agent.submit_for_review(self.project.get("bundle_id", ""))
                finally:
                    await agent.stop()

        store_name = "App Store" if platform == "ios" else "Google Play"
        return await self.execute_with_fallback(
            f"Submit to {store_name} for review",
            api_submit,
            browser_submit,
            f"Please manually submit your app for review in {store_name}. "
            f"Go to your app's page and click 'Submit for Review'."
        )
