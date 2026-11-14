import sys
from playwright.sync_api import sync_playwright

def run():
    print("=== STARTING MULTI-VIEW BROWSER TEST ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True
        )
        context = browser.new_context(
            permissions=["geolocation"],
            geolocation={"latitude": 35.7687, "longitude": -5.8139},
            viewport={"width": 1400, "height": 950}
        )
        page = context.new_page()

        print("1. Opening http://127.0.0.1:8000/static/index.html ...")
        resp = page.goto("http://127.0.0.1:8000/static/index.html")
        page.wait_for_timeout(1000)
        assert resp.status == 200

        # View 1: Welcome
        welcome = page.locator("#smap-view-welcome")
        assert welcome.is_visible(), "Welcome view must be visible initially"
        choice = page.locator("#smap-view-choice")
        assert not choice.is_visible(), "Choice view must be hidden initially"
        agri = page.locator("#smap-view-agri")
        assert not agri.is_visible(), "Agri view must be hidden initially"
        sci = page.locator("#smap-view-sci")
        assert not sci.is_visible(), "Sci view must be hidden initially"

        print("   ✅ View 1 (Welcome) is correctly displayed alone!")
        page.screenshot(path="C:/Users/nahli/.gemini/antigravity/brain/cf2ff417-80a2-4a5e-a1dc-3e75b2505311/step1_welcome.png")

        # Click Start Button
        print("2. Clicking 'Commencer l'Exploration'...")
        btn_start = page.locator("#btn-hero-start")
        btn_start.click()
        page.wait_for_timeout(800)

        # View 2: Choice
        assert choice.is_visible(), "Choice view must now be visible"
        assert not welcome.is_visible(), "Welcome view must now be hidden"
        
        display_city = page.locator("#choice-display-city").text_content()
        print(f"   Detected Location displayed: {display_city}")

        btn_agri = page.locator("#btn-choose-agri")
        btn_sci = page.locator("#btn-choose-sci")
        assert btn_agri.is_visible(), "Button for Mode Agricole must be visible"
        assert btn_sci.is_visible(), "Button for Mode Scientifique must be visible"
        print("   ✅ View 2 (Choice) correctly displays location and 2 big mode buttons!")
        page.screenshot(path="C:/Users/nahli/.gemini/antigravity/brain/cf2ff417-80a2-4a5e-a1dc-3e75b2505311/step2_choice.png")

        # Click Mode Agricole
        print("3. Clicking 'Mode Agricole (16 variables)'...")
        btn_agri.click()
        page.wait_for_timeout(2500) # Wait for GEE / cache response and rendering

        assert agri.is_visible(), "Agri view must now be visible"
        assert not choice.is_visible(), "Choice view must now be hidden"

        # Check agricultural cards
        cards = page.locator("#agri-cards-container .smap-card")
        card_count = cards.count()
        print(f"   Agricultural cards rendered: {card_count}")
        assert card_count == 16, f"Expected 16 agricultural cards, got {card_count}"

        # Click first card to check Darija drawer
        print("   Testing Moroccan Darija drawer on click...")
        cards.first.click()
        page.wait_for_timeout(1000)
        drawer = page.locator("#darija-drawer")
        assert drawer.is_visible(), "Darija drawer must open on click"
        q1 = page.locator("#drawer-q1-what").text_content()
        print(f"   Darija Q1 text: {q1[:60]}...")
        assert len(q1.strip()) > 10

        # Close drawer
        page.locator("#btn-close-drawer").click()
        page.wait_for_timeout(500)
        print("   ✅ View 3 (Mode Agricole) and Darija Drawer working perfectly!")
        page.screenshot(path="C:/Users/nahli/.gemini/antigravity/brain/cf2ff417-80a2-4a5e-a1dc-3e75b2505311/step3_agri.png")

        # Click Direct Switch to Mode Scientifique
        print("4. Clicking 'Passer au Mode Scientifique (46)'...")
        btn_switch_sci = page.locator("#btn-switch-to-sci")
        btn_switch_sci.click()
        page.wait_for_timeout(2500)

        assert sci.is_visible(), "Sci view must now be visible"
        assert not agri.is_visible(), "Agri view must now be hidden"

        sci_cards = page.locator("#sci-cards-container .smap-card")
        sci_card_count = sci_cards.count()
        print(f"   Scientific cards rendered: {sci_card_count}")
        assert sci_card_count == 46, f"Expected 46 scientific cards, got {sci_card_count}"

        chips = page.locator("#sci-category-filter-chips .cat-filter-chip")
        chip_count = chips.count()
        print(f"   Category filter chips: {chip_count}")
        assert chip_count >= 8

        print("   ✅ View 4 (Mode Scientifique 46 variables) working perfectly!")
        page.screenshot(path="C:/Users/nahli/.gemini/antigravity/brain/cf2ff417-80a2-4a5e-a1dc-3e75b2505311/step4_sci.png")

        # Test Back button from Sci
        print("5. Clicking 'Changer de mode / Ville' back button...")
        btn_back_sci = page.locator("#btn-back-from-sci")
        btn_back_sci.click()
        page.wait_for_timeout(600)

        assert choice.is_visible(), "Must return to Choice view"
        assert not sci.is_visible(), "Sci view must now be hidden"
        print("   ✅ Back navigation returns cleanly to Choice view!")

        browser.close()
        print("\n🎉 ALL BROWSER E2E TESTS PASSED 100%!")

if __name__ == "__main__":
    run()
