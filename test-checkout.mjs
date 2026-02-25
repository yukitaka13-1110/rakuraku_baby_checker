import { chromium } from "playwright";
import fs from "fs";

const AUTH_STATE_PATH = "auth-state.json";

async function main() {
  if (!fs.existsSync(AUTH_STATE_PATH)) {
    console.error(`認証ファイルが見つかりません: ${AUTH_STATE_PATH}`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      locale: "ja-JP",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // 1. カートページにアクセス
    console.log("カートページにアクセス中...");
    await page.goto("https://www.amazon.co.jp/gp/cart/view.html", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log(`ページタイトル: ${title}`);

    // 2. スクリーンショット（カートページ）
    await page.screenshot({ path: "screenshot_cart.png", fullPage: true });
    console.log("スクリーンショットを保存しました: screenshot_cart.png");

    // 3.「レジに進む」ボタンを探してクリック
    const checkoutButton = page.getByRole("button", { name: "レジに進む" });
    if ((await checkoutButton.count()) === 0) {
      // input[name="proceedToRetailCheckout"] も試す
      const fallback = page.locator(
        'input[value="レジに進む"], [name="proceedToRetailCheckout"]'
      );
      if ((await fallback.count()) > 0) {
        console.log("「レジに進む」ボタンをクリックします（フォールバック）...");
        await fallback.first().click();
      } else {
        console.error("「レジに進む」ボタンが見つかりませんでした");
        process.exit(1);
      }
    } else {
      console.log("「レジに進む」ボタンをクリックします...");
      await checkoutButton.click();
    }

    // 4. ページ遷移を待つ
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const newTitle = await page.title();
    console.log(`遷移後のページタイトル: ${newTitle}`);

    // 5. スクリーンショット（遷移後）
    await page.screenshot({ path: "screenshot_checkout.png", fullPage: true });
    console.log("スクリーンショットを保存しました: screenshot_checkout.png");

    // 6. 遷移後のページで再度「レジに進む」ボタンを探してクリック
    const checkoutButton2 = page.getByText("レジに進む", { exact: true });
    const count2 = await checkoutButton2.count();
    console.log(`2回目:「レジに進む」候補が ${count2} 件見つかりました`);
    if (count2 > 0) {
      console.log("2回目:「レジに進む」ボタンをクリックします...");
      await checkoutButton2.first().click();
    } else {
      console.error("2回目:「レジに進む」ボタンが見つかりませんでした");
      process.exit(1);
    }

    // 7. ページ遷移を待つ
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const finalTitle = await page.title();
    console.log(`2回目遷移後のページタイトル: ${finalTitle}`);

    // 8. スクリーンショット（2回目遷移後）
    await page.screenshot({ path: "screenshot_checkout2.png", fullPage: true });
    console.log("スクリーンショットを保存しました: screenshot_checkout2.png");

    // 9.「注文を確定する」ボタンを探してクリック
    const placeOrderButton = page.getByText("注文を確定する", { exact: true });
    const countOrder = await placeOrderButton.count();
    console.log(`「注文を確定する」候補が ${countOrder} 件見つかりました`);
    if (countOrder > 0) {
      console.log("「注文を確定する」ボタンをクリックします...");
      await placeOrderButton.first().click();
    } else {
      console.error("「注文を確定する」ボタンが見つかりませんでした");
      process.exit(1);
    }

    // 10. ページ遷移を待つ
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const orderTitle = await page.title();
    console.log(`注文確定後のページタイトル: ${orderTitle}`);

    // 11. スクリーンショット（注文確定後）
    await page.screenshot({ path: "screenshot_order.png", fullPage: true });
    console.log("スクリーンショットを保存しました: screenshot_order.png");

    console.log("完了しました");
  } catch (error) {
    console.error("エラーが発生しました:", error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
