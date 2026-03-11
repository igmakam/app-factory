"""App Store Connect API and Google Play Developer API integration."""
import json
import time
import jwt as pyjwt
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _strip_emoji(text: str) -> str:
    """Remove emoji characters that Apple App Store Connect API rejects."""
    import re
    # Remove emoji unicode ranges
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags
        "\U00002702-\U000027B0"  # dingbats
        "\U000024C2-\U0001F251"  # enclosed characters
        "\U0001f926-\U0001f937"  # additional
        "\U00010000-\U0010ffff"  # supplementary
        "\u200d"                 # zero width joiner
        "\u2640-\u2642"          # gender
        "\ufe0f"                 # variation selector
        "\u2600-\u26FF"          # misc symbols
        "\u2700-\u27BF"          # dingbats
        "]+",
        flags=re.UNICODE,
    )
    return emoji_pattern.sub("", text).strip()


class AppStoreConnectAPI:
    """Integration with Apple's App Store Connect API v2.

    Full launch flow:
    1. validate_credentials() - verify API key works
    2. find_app(bundle_id) - find app by bundle ID
    3. get_or_create_version(app_id) - get existing or create new version
    4. update_version_localization(version_id, listing) - update description, keywords
    5. update_app_info_localization(app_id, listing) - update name, subtitle
    6. submit_for_review(version_id) - submit for Apple review
    7. get_review_status(app_id) - check review progress
    """

    def __init__(self, key_id: str, issuer_id: str, private_key: str):
        self.key_id = key_id
        self.issuer_id = issuer_id
        self.private_key = private_key
        self.base_url = "https://api.appstoreconnect.apple.com/v1"

    def _generate_token(self) -> str:
        """Generate JWT token for App Store Connect API."""
        now = int(time.time())
        payload = {
            "iss": self.issuer_id,
            "iat": now,
            "exp": now + 1200,  # 20 minutes
            "aud": "appstoreconnect-v1",
        }
        return pyjwt.encode(payload, self.private_key, algorithm="ES256", headers={"kid": self.key_id})

    async def _request(self, method: str, path: str, json_data: dict = None, params: dict = None, timeout: float = 15.0) -> dict:
        """Make an authenticated API request."""
        import httpx
        token = self._generate_token()
        headers = {"Authorization": f"Bearer {token}"}
        if json_data is not None:
            headers["Content-Type"] = "application/json"

        async with httpx.AsyncClient(timeout=timeout) as client:
            url = f"{self.base_url}{path}" if path.startswith("/") else path
            if method == "GET":
                resp = await client.get(url, headers=headers, params=params)
            elif method == "POST":
                resp = await client.post(url, headers=headers, json=json_data)
            elif method == "PATCH":
                resp = await client.patch(url, headers=headers, json=json_data)
            elif method == "DELETE":
                resp = await client.delete(url, headers=headers)
            else:
                resp = await client.put(url, headers=headers, json=json_data)

            result = {"status": resp.status_code}
            try:
                result["data"] = resp.json()
            except Exception:
                result["data"] = {}
                result["text"] = resp.text[:500]
            return result

    async def validate_credentials(self) -> dict:
        """Validate Apple API credentials by making a test request."""
        try:
            result = await self._request("GET", "/apps", params={"limit": 1})
            if result["status"] == 200:
                return {"valid": True, "message": "Apple API credentials validated successfully"}
            else:
                return {"valid": False, "message": f"Apple API returned status {result['status']}: {str(result.get('data', result.get('text', '')))[:200]}"}
        except Exception as e:
            return {"valid": False, "message": f"Validation failed: {str(e)}"}

    async def list_apps(self) -> dict:
        """List all apps in the account."""
        try:
            result = await self._request("GET", "/apps", params={"limit": 200})
            if result["status"] == 200:
                apps = result["data"].get("data", [])
                return {
                    "success": True,
                    "apps": [
                        {
                            "id": app["id"],
                            "name": app["attributes"].get("name", ""),
                            "bundle_id": app["attributes"].get("bundleId", ""),
                            "sku": app["attributes"].get("sku", ""),
                        }
                        for app in apps
                    ]
                }
            return {"success": False, "error": f"HTTP {result['status']}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def find_app(self, bundle_id: str) -> dict:
        """Find an app by bundle ID."""
        try:
            result = await self._request("GET", "/apps", params={"filter[bundleId]": bundle_id})
            if result["status"] == 200:
                apps = result["data"].get("data", [])
                if apps:
                    app = apps[0]
                    return {
                        "success": True,
                        "found": True,
                        "app_id": app["id"],
                        "name": app["attributes"].get("name", ""),
                        "bundle_id": app["attributes"].get("bundleId", ""),
                    }
                return {"success": True, "found": False, "error": f"No app with bundle ID '{bundle_id}'"}
            return {"success": False, "error": f"HTTP {result['status']}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_or_create_version(self, app_id: str, version_string: str = "1.0", platform: str = "IOS") -> dict:
        """Get existing editable version or create a new one."""
        try:
            result = await self._request("GET", f"/apps/{app_id}/appStoreVersions",
                                          params={"limit": 5})
            if result["status"] == 200:
                versions = result["data"].get("data", [])
                for v in versions:
                    state = v["attributes"].get("appStoreState", "")
                    if state in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED"):
                        return {
                            "success": True,
                            "version_id": v["id"],
                            "version_string": v["attributes"].get("versionString", ""),
                            "state": state,
                            "created": False,
                        }

                create_result = await self._request("POST", "/appStoreVersions", json_data={
                    "data": {
                        "type": "appStoreVersions",
                        "attributes": {
                            "versionString": version_string,
                            "platform": platform,
                        },
                        "relationships": {
                            "app": {
                                "data": {"type": "apps", "id": app_id}
                            }
                        }
                    }
                })
                if create_result["status"] in (200, 201):
                    v = create_result["data"].get("data", {})
                    return {
                        "success": True,
                        "version_id": v.get("id", ""),
                        "version_string": v.get("attributes", {}).get("versionString", version_string),
                        "state": "PREPARE_FOR_SUBMISSION",
                        "created": True,
                    }
                else:
                    error_detail = str(create_result.get("data", {}).get("errors", create_result.get("text", "")))[:300]
                    return {"success": False, "error": f"Failed to create version: {error_detail}"}

            return {"success": False, "error": f"HTTP {result['status']}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_version_localizations(self, version_id: str) -> dict:
        """Get all localizations for a version."""
        try:
            result = await self._request("GET", f"/appStoreVersions/{version_id}/appStoreVersionLocalizations")
            if result["status"] == 200:
                locs = result["data"].get("data", [])
                return {
                    "success": True,
                    "localizations": [
                        {
                            "id": loc["id"],
                            "locale": loc["attributes"].get("locale", ""),
                            "description": loc["attributes"].get("description", ""),
                            "keywords": loc["attributes"].get("keywords", ""),
                            "whatsNew": loc["attributes"].get("whatsNew", ""),
                            "promotionalText": loc["attributes"].get("promotionalText", ""),
                        }
                        for loc in locs
                    ]
                }
            return {"success": False, "error": f"HTTP {result['status']}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def update_version_localization(self, localization_id: str, listing_data: dict) -> dict:
        """Update version localization (description, keywords, whatsNew, promotionalText).
        Automatically retries without whatsNew if Apple rejects it (e.g. first version)."""
        try:
            attributes = {}
            if listing_data.get("description"):
                attributes["description"] = _strip_emoji(listing_data["description"])[:4000]
            if listing_data.get("keywords"):
                attributes["keywords"] = _strip_emoji(listing_data["keywords"])[:100]
            if listing_data.get("whats_new") or listing_data.get("whatsNew"):
                attributes["whatsNew"] = _strip_emoji(listing_data.get("whats_new") or listing_data.get("whatsNew", ""))[:4000]
            if listing_data.get("promotional_text") or listing_data.get("promotionalText"):
                attributes["promotionalText"] = _strip_emoji(listing_data.get("promotional_text") or listing_data.get("promotionalText", ""))[:170]

            if not attributes:
                return {"success": True, "message": "No fields to update"}

            result = await self._request("PATCH", f"/appStoreVersionLocalizations/{localization_id}", json_data={
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "id": localization_id,
                    "attributes": attributes,
                }
            })
            if result["status"] == 200:
                return {"success": True, "message": "Version localization updated"}

            # Check if whatsNew caused the error — retry without it
            errors = result.get("data", {}).get("errors", [])
            whats_new_error = any("whatsNew" in str(e) for e in errors)
            if whats_new_error and "whatsNew" in attributes:
                logger.info("Retrying update_version_localization without whatsNew (not allowed for this version)")
                attributes.pop("whatsNew")
                if not attributes:
                    return {"success": True, "message": "No fields to update (whatsNew skipped for first version)"}
                retry_result = await self._request("PATCH", f"/appStoreVersionLocalizations/{localization_id}", json_data={
                    "data": {
                        "type": "appStoreVersionLocalizations",
                        "id": localization_id,
                        "attributes": attributes,
                    }
                })
                if retry_result["status"] == 200:
                    return {"success": True, "message": "Version localization updated (whatsNew skipped — first version)"}
                error_detail = str(retry_result.get("data", {}).get("errors", retry_result.get("text", "")))[:300]
                return {"success": False, "error": f"Update failed on retry: {error_detail}"}

            error_detail = str(errors or result.get("text", ""))[:300]
            return {"success": False, "error": f"Update failed: {error_detail}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def create_version_localization(self, version_id: str, locale: str, listing_data: dict) -> dict:
        """Create a new version localization for a given locale."""
        try:
            attributes = {"locale": locale}
            if listing_data.get("description"):
                attributes["description"] = listing_data["description"][:4000]
            if listing_data.get("keywords"):
                attributes["keywords"] = listing_data["keywords"][:100]

            result = await self._request("POST", "/appStoreVersionLocalizations", json_data={
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "attributes": attributes,
                    "relationships": {
                        "appStoreVersion": {
                            "data": {"type": "appStoreVersions", "id": version_id}
                        }
                    }
                }
            })
            if result["status"] in (200, 201):
                loc = result["data"].get("data", {})
                return {"success": True, "id": loc.get("id", ""), "locale": locale}
            else:
                error_detail = str(result.get("data", {}).get("errors", result.get("text", "")))[:300]
                return {"success": False, "error": f"Create localization failed: {error_detail}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_app_info_localizations(self, app_id: str) -> dict:
        """Get app info and its localizations (name, subtitle, privacy URL)."""
        try:
            result = await self._request("GET", f"/apps/{app_id}/appInfos")
            if result["status"] != 200:
                return {"success": False, "error": f"HTTP {result['status']}"}

            infos = result["data"].get("data", [])
            if not infos:
                return {"success": False, "error": "No app info found"}

            info_id = infos[0]["id"]
            loc_result = await self._request("GET", f"/appInfos/{info_id}/appInfoLocalizations")
            if loc_result["status"] == 200:
                locs = loc_result["data"].get("data", [])
                return {
                    "success": True,
                    "app_info_id": info_id,
                    "localizations": [
                        {
                            "id": loc["id"],
                            "locale": loc["attributes"].get("locale", ""),
                            "name": loc["attributes"].get("name", ""),
                            "subtitle": loc["attributes"].get("subtitle", ""),
                            "privacyPolicyUrl": loc["attributes"].get("privacyPolicyUrl", ""),
                        }
                        for loc in locs
                    ]
                }
            return {"success": False, "error": f"HTTP {loc_result['status']}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def update_app_info_localization(self, localization_id: str, listing_data: dict) -> dict:
        """Update app info localization (name, subtitle)."""
        try:
            attributes = {}
            if listing_data.get("title"):
                attributes["name"] = _strip_emoji(listing_data["title"])[:30]
            if listing_data.get("subtitle"):
                attributes["subtitle"] = _strip_emoji(listing_data["subtitle"])[:30]
            if listing_data.get("privacy_policy_url"):
                attributes["privacyPolicyUrl"] = listing_data["privacy_policy_url"]

            if not attributes:
                return {"success": True, "message": "No fields to update"}

            result = await self._request("PATCH", f"/appInfoLocalizations/{localization_id}", json_data={
                "data": {
                    "type": "appInfoLocalizations",
                    "id": localization_id,
                    "attributes": attributes,
                }
            })
            if result["status"] == 200:
                return {"success": True, "message": "App info localization updated"}
            else:
                error_detail = str(result.get("data", {}).get("errors", result.get("text", "")))[:300]
                return {"success": False, "error": f"Update failed: {error_detail}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def submit_for_review(self, version_id: str) -> dict:
        """Submit app version for App Store review."""
        try:
            result = await self._request("POST", "/appStoreVersionSubmissions", json_data={
                "data": {
                    "type": "appStoreVersionSubmissions",
                    "relationships": {
                        "appStoreVersion": {
                            "data": {"type": "appStoreVersions", "id": version_id}
                        }
                    }
                }
            })
            if result["status"] in (200, 201):
                return {"success": True, "message": "Submitted for review"}
            else:
                errors = result.get("data", {}).get("errors", [])
                error_detail = str(errors)[:500]
                # Detect common reasons for submit failure
                is_forbidden = any(e.get("code") == "FORBIDDEN_ERROR" for e in errors if isinstance(e, dict))
                if is_forbidden:
                    return {
                        "success": False,
                        "error": "Cannot submit for review yet. Common reasons: missing binary (upload via Xcode/Transporter), missing screenshots, missing app icon, or missing privacy policy URL.",
                        "raw_error": error_detail,
                        "needs_binary": True,
                    }
                return {"success": False, "error": f"Submit failed: {error_detail}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_review_status(self, app_id: str) -> dict:
        """Get current review status of the app."""
        try:
            result = await self._request("GET", f"/apps/{app_id}/appStoreVersions",
                                          params={"limit": 1})
            if result["status"] == 200:
                versions = result["data"].get("data", [])
                if versions:
                    version = versions[0]
                    return {
                        "success": True,
                        "version_id": version["id"],
                        "version": version["attributes"].get("versionString", ""),
                        "state": version["attributes"].get("appStoreState", "UNKNOWN"),
                    }
                return {"success": False, "state": "NO_VERSIONS"}
            return {"success": False, "state": "API_ERROR", "error": f"HTTP {result['status']}"}
        except Exception as e:
            return {"success": False, "error": str(e), "state": "ERROR"}

    async def full_listing_update(self, app_id: str, listing_data: dict) -> dict:
        """Complete listing update: version localization + app info localization.

        listing_data should have: title, subtitle, description, keywords
        Returns detailed result of each step.
        """
        results = {"steps": [], "success": True}

        # Step 1: Get or create version
        version_result = await self.get_or_create_version(app_id)
        results["steps"].append({"step": "get_version", "result": version_result})
        if not version_result.get("success"):
            results["success"] = False
            return results
        version_id = version_result["version_id"]
        results["version_id"] = version_id

        # Step 2: Update version localization (description, keywords)
        loc_result = await self.get_version_localizations(version_id)
        results["steps"].append({"step": "get_version_locs", "result": loc_result})
        if loc_result.get("success") and loc_result.get("localizations"):
            en_loc = next((loc for loc in loc_result["localizations"] if loc["locale"] == "en-US"), loc_result["localizations"][0])
            update_result = await self.update_version_localization(en_loc["id"], listing_data)
            results["steps"].append({"step": "update_version_loc", "result": update_result})
            if not update_result.get("success"):
                results["success"] = False
        elif loc_result.get("success"):
            create_loc = await self.create_version_localization(version_id, "en-US", listing_data)
            results["steps"].append({"step": "create_version_loc", "result": create_loc})

        # Step 3: Update app info localization (name, subtitle)
        if listing_data.get("title") or listing_data.get("subtitle"):
            info_result = await self.get_app_info_localizations(app_id)
            results["steps"].append({"step": "get_info_locs", "result": info_result})
            if info_result.get("success") and info_result.get("localizations"):
                en_info = next((loc for loc in info_result["localizations"] if loc["locale"] == "en-US"), info_result["localizations"][0])
                info_update = await self.update_app_info_localization(en_info["id"], listing_data)
                results["steps"].append({"step": "update_info_loc", "result": info_update})

        return results


class GooglePlayAPI:
    """Integration with Google Play Developer API v3."""

    def __init__(self, service_account_json: dict):
        self.service_account = service_account_json
        self.base_url = "https://androidpublisher.googleapis.com/androidpublisher/v3"

    async def _get_access_token(self) -> Optional[str]:
        """Get OAuth2 access token from service account."""
        try:
            import httpx
            now = int(time.time())
            payload = {
                "iss": self.service_account.get("client_email", ""),
                "scope": "https://www.googleapis.com/auth/androidpublisher",
                "aud": "https://oauth2.googleapis.com/token",
                "iat": now,
                "exp": now + 3600,
            }
            private_key = self.service_account.get("private_key", "")
            token = pyjwt.encode(payload, private_key, algorithm="RS256")

            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                        "assertion": token,
                    }
                )
                if response.status_code == 200:
                    return response.json().get("access_token")
            return None
        except Exception:
            return None

    async def validate_credentials(self) -> dict:
        """Validate Google Play API credentials."""
        try:
            token = await self._get_access_token()
            if token:
                return {"valid": True, "message": "Google Play credentials validated successfully"}
            return {"valid": False, "message": "Failed to obtain access token"}
        except Exception as e:
            return {"valid": False, "message": f"Validation failed: {str(e)}"}

    async def create_edit(self, package_name: str) -> dict:
        """Create an edit for the app."""
        try:
            import httpx
            token = await self._get_access_token()
            if not token:
                return {"success": False, "error": "Failed to get access token"}

            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.post(
                    f"{self.base_url}/applications/{package_name}/edits",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json={}
                )
                if response.status_code in (200, 201):
                    return {"success": True, "edit_id": response.json().get("id")}
                return {"success": False, "error": f"Status {response.status_code}: {response.text[:200]}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def update_listing(self, package_name: str, edit_id: str, listing_data: dict, language: str = "en-US") -> dict:
        """Update store listing for a specific language."""
        try:
            import httpx
            token = await self._get_access_token()
            if not token:
                return {"success": False, "error": "Failed to get access token"}

            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.put(
                    f"{self.base_url}/applications/{package_name}/edits/{edit_id}/listings/{language}",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json={
                        "title": listing_data.get("title", ""),
                        "shortDescription": listing_data.get("subtitle", ""),
                        "fullDescription": listing_data.get("description", ""),
                    }
                )
                return {"success": response.status_code in (200, 201), "data": response.json() if response.status_code in (200, 201) else response.text[:200]}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def commit_edit(self, package_name: str, edit_id: str) -> dict:
        """Commit an edit to publish changes."""
        try:
            import httpx
            token = await self._get_access_token()
            if not token:
                return {"success": False, "error": "Failed to get access token"}

            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.post(
                    f"{self.base_url}/applications/{package_name}/edits/{edit_id}:commit",
                    headers={"Authorization": f"Bearer {token}"},
                )
                return {"success": response.status_code in (200, 201), "data": response.json() if response.status_code in (200, 201) else response.text[:200]}
        except Exception as e:
            return {"success": False, "error": str(e)}


def create_apple_client(credentials: dict) -> Optional[AppStoreConnectAPI]:
    """Create Apple API client from stored credentials."""
    try:
        return AppStoreConnectAPI(
            key_id=credentials.get("key_id", ""),
            issuer_id=credentials.get("issuer_id", ""),
            private_key=credentials.get("private_key", ""),
        )
    except Exception:
        return None


def create_google_client(credentials: dict) -> Optional[GooglePlayAPI]:
    """Create Google Play API client from stored credentials."""
    try:
        return GooglePlayAPI(service_account_json=credentials)
    except Exception:
        return None
