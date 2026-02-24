import { chromium } from "playwright";

const AMAZON_EMAIL = process.env.AMAZON_EMAIL;
const AMAZON_PASSWORD = process.env.AMAZON_PASSWORD;
const INACTIVITY_TIMEOUT = 60; // 10秒間操作がなければ自動保存

async function saveAuthState() {
  console.log("ブラウザを起動中...");

  const browser = await chromium.launch({
    headless: false, // ブラウザを表示
  });

  const context = await browser.newContext({
    locale: "ja-JP",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    console.log("Amazonログインページにアクセス中...");
    await page.goto(
      "https://www.amazon.co.jp/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.co.jp%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=jpflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0"
    );

    // 環境変数があれば自動入力
    if (AMAZON_EMAIL && AMAZON_PASSWORD) {
      console.log("自動ログイン中...");

      await page.waitForSelector("#ap_email_login", { timeout: 15000 });
      await page.fill("#ap_email_login", AMAZON_EMAIL);

      const continueButton = await page.$('input[aria-labelledby="continue-announce"]');
      if (continueButton) {
        await continueButton.click();
        await page.waitForTimeout(2000);
      }

      await page.waitForSelector("#ap_password", { timeout: 15000 });
      await page.fill("#ap_password", AMAZON_PASSWORD);
      await page.click("#auth-signin-button");
      await page.waitForTimeout(3000);
    } else {
      console.log("手動でログインしてください...");
    }

    // カウントダウン表示
    let countdown = INACTIVITY_TIMEOUT;
    console.log(`\n${countdown}秒後に認証情報を自動保存します...`);

    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        process.stdout.write(`\r🔒 ${countdown}秒後に自動保存します...`);
      }
    }, 1000);

    // 指定秒数待機
    await page.waitForTimeout(INACTIVITY_TIMEOUT * 1000);
    clearInterval(countdownInterval);

    // 認証状態を保存
    console.log("\n\n認証情報を保存中...");
    await context.storageState({ path: "auth-state.json" });
    console.log("✅ 認証情報を auth-state.json に保存しました！");

    // 保存内容の確認
    const fs = await import("fs");
    const authState = JSON.parse(fs.readFileSync("auth-state.json", "utf-8"));
    console.log(`\nCookie数: ${authState.cookies.length}`);
    console.log(`LocalStorage数: ${authState.origins?.length || 0}`);

  } catch (error) {
    console.error("エラーが発生しました:", error.message);
  } finally {
    await browser.close();
  }
}

saveAuthState();
