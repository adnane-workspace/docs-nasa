import sys
import os
import time
import threading

sys.path.insert(0, os.path.abspath("."))
import uvicorn
from playwright.sync_api import sync_playwright

def start_server():
    uvicorn.run("app.main:app", host="127.0.0.1", port=8888, log_level="warning")

def run():
    print("=== STARTING VIRTUAL AGRICULTURAL LABORATORY E2E TEST ===")
    
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2) # Give server time to bind

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True
        )
        context = browser.new_context(
            permissions=["geolocation"],
            geolocation={"latitude": 33.8938, "longitude": -5.5516},
            viewport={"width": 1440, "height": 950}
        )
        page = context.new_page()

        print("1. Opening http://127.0.0.1:8888/static/index.html ...")
        resp = page.goto("http://127.0.0.1:8888/static/index.html")
        page.wait_for_timeout(1000)
        assert resp.status == 200, f"Page failed to load: {resp.status}"

        # Step 1: Welcome View
        welcome = page.locator("#smap-view-welcome")
        assert welcome.is_visible(), "Welcome view must be visible initially"
        print("   ✅ Welcome View displayed")

        # Step 2: Click Start -> Choice View
        page.locator("#btn-hero-start").click()
        page.wait_for_timeout(800)

        choice = page.locator("#smap-view-choice")
        assert choice.is_visible(), "Choice view must now be visible"
        print("   ✅ Choice View displayed with 3 modes")

        btn_ai = page.locator("#btn-choose-ai")
        assert btn_ai.is_visible(), "Button for Mode IA / Labo must be visible"

        # Step 3: Click Conseiller IA & Plan Labo -> Page 3
        print("2. Entering Page 3 (Conseiller IA & Virtual Agricultural Laboratory)...")
        btn_ai.click()
        page.wait_for_timeout(3000) # Wait for simulation to compute and render

        ai_view = page.locator("#smap-view-ai")
        assert ai_view.is_visible(), "Page 3 (AI / Virtual Lab) must be visible"
        print("   ✅ Page 3 is active and visible!")

        # Step 4: Verify Farmer Simulation Control Panel
        soil_select = page.locator("#sim-soil-select")
        water_select = page.locator("#sim-water-select")
        budget_select = page.locator("#sim-budget-select")
        run_sim_btn = page.locator("#btn-run-simulation")
        assert soil_select.is_visible(), "Soil selector must be visible"
        assert water_select.is_visible(), "Water selector must be visible"
        assert budget_select.is_visible(), "Budget selector must be visible"
        assert run_sim_btn.is_visible(), "Run Simulation button must be visible"
        print("   ✅ Farmer Simulation Control Panel verified")

        # Step 5: Verify Lab 1 (Crop Battle Lab)
        winner_banner = page.locator("#battle-winner-banner")
        assert winner_banner.is_visible(), "Winner banner must be visible in Lab 1"
        winner_title = page.locator("#battle-winner-title").text_content()
        print(f"   🏆 Crop Battle Winner: {winner_title.strip()}")

        radar_canvas = page.locator("#chart-sim-radar")
        assert radar_canvas.is_visible(), "Radar chart canvas must be visible"
        
        plan_cards = page.locator("#battle-plans-cards .plan-scorecard")
        assert plan_cards.count() == 3, f"Expected 3 plan cards, got {plan_cards.count()}"
        print(f"   ✅ Crop Battle Lab has Radar Chart and 3 Plan Scorecards")

        screenshot_path = "C:/Users/nahli/.gemini/antigravity/brain/cf2ff417-80a2-4a5e-a1dc-3e75b2505311/step6_virtual_lab_crop_battle.png"
        page.screenshot(path=screenshot_path)
        print(f"   📸 Saved screenshot: {screenshot_path}")

        # Step 6: Test Lab 2 (Climate Attack Lab)
        print("3. Testing Lab 2: Climate Attack Lab...")
        tab_attack_btn = page.locator(".sim-tab-btn[data-simtab='tab-climate-attack']")
        tab_attack_btn.click()
        page.wait_for_timeout(800)

        panel_attack = page.locator("#tab-climate-attack")
        assert panel_attack.is_visible(), "Climate Attack panel must be visible"

        # Click Drought Shock (-40%)
        drought_btn = page.locator(".shock-btn[data-shock='drought']")
        drought_btn.click()
        page.wait_for_timeout(2500) # Wait for live shock recalculation

        shock_summary = page.locator("#shock-impact-summary").text_content()
        print(f"   🌪️ Climate Shock active: {shock_summary.strip()[:80]}...")

        screenshot_path2 = "C:/Users/nahli/.gemini/antigravity/brain/cf2ff417-80a2-4a5e-a1dc-3e75b2505311/step7_climate_attack_drought.png"
        page.screenshot(path=screenshot_path2)
        print(f"   📸 Saved screenshot: {screenshot_path2}")

        # Step 7: Test Lab 3 (Farm Time Machine)
        print("4. Testing Lab 3: Farm Time Machine...")
        tab_tm_btn = page.locator(".sim-tab-btn[data-simtab='tab-time-machine']")
        tab_tm_btn.click()
        page.wait_for_timeout(800)

        panel_tm = page.locator("#tab-time-machine")
        assert panel_tm.is_visible(), "Time Machine panel must be visible"
        tm_cards = page.locator("#tm-content-container .tm-metric-card")
        assert tm_cards.count() >= 3, f"Expected at least 3 time machine cards, got {tm_cards.count()}"
        print(f"   ✅ Farm Time Machine counterfactual metrics verified ({tm_cards.count()} cards)")

        # Step 8: Test Lab 4 (AI Scientific Tribunal)
        print("5. Testing Lab 4: AI Scientific Tribunal...")
        tab_tribunal_btn = page.locator(".sim-tab-btn[data-simtab='tab-scientific-tribunal']")
        tab_tribunal_btn.click()
        page.wait_for_timeout(800)

        panel_tribunal = page.locator("#tab-scientific-tribunal")
        assert panel_tribunal.is_visible(), "Tribunal panel must be visible"

        agent_cards = page.locator("#tribunal-agents-grid .tribunal-agent-card")
        assert agent_cards.count() == 4, f"Expected 4 expert agent cards, got {agent_cards.count()}"
        print(f"   ⚖️ AI Scientific Tribunal: {agent_cards.count()} expert agents evaluated")

        supreme_verdict = page.locator("#tribunal-supreme-box").text_content()
        assert "حكم المحكمة" in supreme_verdict or "الخطة" in supreme_verdict
        print(f"   ✅ Supreme Synthesis in Moroccan Darija verified!")

        screenshot_path3 = "C:/Users/nahli/.gemini/antigravity/brain/cf2ff417-80a2-4a5e-a1dc-3e75b2505311/step8_scientific_tribunal.png"
        page.screenshot(path=screenshot_path3)
        print(f"   📸 Saved screenshot: {screenshot_path3}")

        # Step 9: Verify Bottom Chat Panel
        chat_form = page.locator("#ai-page-chat-form")
        assert chat_form.is_visible(), "Streaming dialogue panel must be visible at bottom"
        print("   ✅ Full-page Nemotron AI streaming chat panel verified")

        browser.close()
        print("=== ALL VIRTUAL LAB TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run()
