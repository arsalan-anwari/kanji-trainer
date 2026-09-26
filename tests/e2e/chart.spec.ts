import { expect, test } from "./run";

test("flips a flashcard from the keyboard and shows its back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("textbox", { name: "Search words" }).fill("学校");

  const card = page.getByRole("group", { name: /^学校, がっこう, ga-k-ko-u, school/ });
  const flip = card.getByRole("button", { name: "Turn 学校 over" });
  await expect(flip).toHaveAttribute("aria-pressed", "false");
  const front = await card.boundingBox();
  await flip.focus();
  await page.keyboard.press("Enter");

  await expect(flip).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator('[data-face="front"]')).toBeHidden();
  await expect(card.getByRole("button", { name: "Play 学校" })).toBeHidden();
  expect((await card.boundingBox())?.height).toBe(front?.height);
  await expect(card.locator('[data-face="back"]')).toContainText("ga-k-ko-u");
  await expect(card.locator('[data-face="back"]')).toContainText("学校は八時半に始まります。");
  await expect(card.locator('[data-face="back"]')).toContainText("Gakkou wa hachiji han ni hajimarimasu.");
  await expect(card.locator('[data-face="back"]')).not.toContainText("コウ");

  await page.keyboard.press("Enter");
  await expect(card.locator('[data-face="front"]')).toBeVisible();
});

test("fetches no clip until a play button is pressed, and playing never flips", async ({ page }) => {
  const clips: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/audio/")) clips.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Expand all" }).click();
  await page.getByRole("textbox", { name: "Search words" }).fill("学校");

  const card = page.getByRole("group", { name: /^学校, がっこう/ });
  const flip = card.getByRole("button", { name: "Turn 学校 over" });
  await flip.focus();
  await page.keyboard.press("Enter");
  await expect(flip).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(flip).toHaveAttribute("aria-pressed", "false");
  expect(clips).toEqual([]);

  await card.getByRole("button", { name: "Play 学校" }).click();
  await expect.poll(() => clips.length).toBe(1);
  expect(clips[0]).toContain("/packs/n5-base/audio/places/buildings/school.mp3");
  await expect(flip).toHaveAttribute("aria-pressed", "false");
});

test("builds a flashcard pdf from hand-picked words in the background", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Export flashcards" }).click();

  await page.getByRole("textbox", { name: "Search words" }).fill("月");
  await page.getByRole("button", { name: "Unselect all" }).click();
  await expect(page.getByText("0 words selected for the PDF")).toBeVisible();
  await page.getByRole("button", { name: /^今月/ }).click();
  await page.getByRole("button", { name: /^来月/ }).click();
  await page.getByRole("button", { name: /^先月/ }).click();
  await expect(page.getByText("3 words selected for the PDF")).toBeVisible();

  await page.getByRole("button", { name: "Download as PDF" }).click();
  const grid = page.getByRole("group", { name: "Cards per page" });
  await grid.getByRole("button", { name: "1×1" }).click();
  await expect(page.getByText("3 cards on 6 pages, fronts and backs")).toBeVisible();
  await grid.getByRole("button", { name: "2×2" }).click();
  await expect(page.getByText("3 cards on 2 pages, fronts and backs")).toBeVisible();
  await page.getByRole("button", { name: "Start export" }).click();

  await expect(page.getByText("The flashcard PDF is ready.")).toBeVisible({ timeout: 20_000 });
  const saving = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await saving;
  expect(download.suggestedFilename()).toMatch(/^kanji-flashcards-.*-2x2\.pdf$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf).toContain("/Count 2");
});

test("exports one pdf per grid when all grids are picked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Export flashcards" }).click();
  await page.getByRole("textbox", { name: "Search words" }).fill("月");
  await page.getByRole("button", { name: "Unselect all" }).click();
  await page.getByRole("button", { name: /^今月/ }).click();

  await page.getByRole("button", { name: "Download as PDF" }).click();
  await page.getByRole("group", { name: "Cards per page" }).getByRole("button", { name: "All" }).click();
  await expect(page.getByText("1 cards in 4 PDFs, one per grid, 8 pages in all")).toBeVisible();
  await page.getByRole("button", { name: "Start export" }).click();

  await expect(page.getByText("The flashcard PDFs are ready.")).toBeVisible({ timeout: 20_000 });
  const names: string[] = [];
  page.on("download", (download) => names.push(download.suggestedFilename()));
  await page.getByRole("button", { name: "Save PDFs to a folder" }).click();
  await expect.poll(() => names.length).toBe(4);
  expect(names.map((name) => name.replace(/^kanji-flashcards-\d{4}-\d{2}-\d{2}-/, ""))).toEqual([
    "1x1.pdf",
    "2x2.pdf",
    "3x3.pdf",
    "4x4.pdf"
  ]);
});

test("cancels a running export and leaves nothing behind", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Export flashcards" }).click();
  await page.getByRole("button", { name: "Download as PDF" }).click();
  await page.getByRole("group", { name: "Cards per page" }).getByRole("button", { name: "1×1" }).click();
  await page.getByRole("button", { name: "Start export" }).click();

  await expect(page.getByText("Building the flashcard PDF…")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Building the flashcard PDF…")).toBeHidden();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeHidden();
});

test("prints every word of the level at the largest grid", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Export flashcards" }).click();
  await page.getByRole("button", { name: "Download as PDF" }).click();
  const grid = page.getByRole("group", { name: "Cards per page" });
  await expect(grid.getByRole("button")).toHaveCount(5);
  await grid.getByRole("button", { name: "4×4" }).click();
  await page.getByRole("button", { name: "Start export" }).click();

  await expect(page.getByText("The flashcard PDF is ready.")).toBeVisible({ timeout: 60_000 });
});

test("prints every word of every pack at the largest grid", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("kanji-trainer-disabled-packs", "[]"));
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Export flashcards" }).click();
  await page.getByRole("button", { name: "Download as PDF" }).click();
  await page.getByRole("group", { name: "Cards per page" }).getByRole("button", { name: "4×4" }).click();
  await page.getByRole("button", { name: "Start export" }).click();

  await expect(page.getByText("The flashcard PDF is ready.")).toBeVisible({ timeout: 90_000 });
});

test("expands and collapses every set at once", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  const sets = page.locator("main details");
  await expect(sets.first()).not.toHaveAttribute("open");

  await page.getByRole("button", { name: "Expand all" }).click();
  for (const set of await sets.all()) await expect(set).toHaveAttribute("open");
  await expect(page.getByRole("group", { name: /^土曜日/ })).toBeVisible();

  await page.getByRole("button", { name: "Collapse all" }).click();
  for (const set of await sets.all()) await expect(set).not.toHaveAttribute("open");
  await expect(page.getByRole("button", { name: "Expand all" })).toBeVisible();
});
