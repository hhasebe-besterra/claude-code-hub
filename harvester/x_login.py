"""X ログイン用プロファイル初期化.

ブラウザが開くので X にログインしてください。
ログイン後、ブラウザを閉じれば ~/.cchub_x_profile にクッキーが保存されます。
次回以降 x_harvest.py はこのプロファイルを使ってログイン済み状態でアクセスします。
"""
from playwright.sync_api import sync_playwright
from pathlib import Path

def main():
    user_data = str(Path.home() / ".cchub_x_profile")
    print(f"[x_login] プロファイル: {user_data}")
    print("[x_login] ブラウザが開きます。X にログインしてください。")
    print("[x_login] ログイン完了後、ブラウザを閉じてください。")

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data,
            headless=False,
            viewport={"width": 1280, "height": 900},
            locale="ja-JP",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()
        page.goto("https://x.com/login", wait_until="domcontentloaded", timeout=60000)

        # ユーザーがログインしてブラウザを閉じるのを待つ
        try:
            page.wait_for_event("close", timeout=300000)  # 5分待機
        except:
            pass

        browser.close()
    print("[x_login] プロファイル保存完了。x_harvest.py が使えるようになりました。")

if __name__ == "__main__":
    main()
