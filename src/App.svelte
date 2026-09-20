<script lang="ts">
  import {
    AppHeader,
    Button,
    Card,
    focusMain,
    keynav,
    KeyNavBadge,
    PageBackdrop,
    SettingsMenu
  } from "kaizen-ui";
  import { app, TAB_ROUTES, type TabRoute } from "./lib/state.svelte";
  import SetupScreen from "./lib/components/setup/SetupScreen.svelte";
  import StudyScreen from "./lib/components/setup/StudyScreen.svelte";
  import QuizScreen from "./lib/components/quiz/QuizScreen.svelte";
  import ResultScreen from "./lib/components/result/ResultScreen.svelte";
  import ReportsScreen from "./lib/components/reports/ReportsScreen.svelte";
  import { t } from "./lib/i18n.svelte";

  app.load();

  let headerHeight = $state(0);
  let menu = $state(false);

  const prefsLabels = $derived({
    title: t("common.prefs.title"),
    close: t("common.prefs.close"),
    theme: t("common.prefs.theme"),
    themeSystem: t("common.prefs.themeSystem"),
    themeLight: t("common.prefs.themeLight"),
    themeDark: t("common.prefs.themeDark"),
    contrast: t("common.prefs.contrast"),
    contrastHint: t("common.prefs.contrastHint"),
    zoom: t("common.prefs.zoom"),
    scale: t("common.prefs.scale"),
    scaleHint: t("common.prefs.scaleHint"),
    zoomIn: t("common.prefs.zoomIn"),
    zoomOut: t("common.prefs.zoomOut"),
    sound: t("common.prefs.sound"),
    effects: t("common.prefs.effects"),
    effectsHint: t("common.prefs.effectsHint"),
    language: t("common.prefs.language"),
    persist: t("common.prefs.persist")
  });

  // The run owns the screen: paging away mid-question would lose the answers.
  const tabs = $derived(
    app.route === "quiz"
      ? []
      : TAB_ROUTES.map((route) => ({ value: route, label: t(`common.nav.${route}`) }))
  );

  const tab = $derived<TabRoute>(app.route === "reports" ? "reports" : "setup");

  $effect(() => focusMain(app.route));
</script>

<svelte:window onkeydown={(event) => keynav.handle(event)} />

<div
  class="flex min-h-dvh w-full flex-col [--edge-x:1rem] [--edge-y:0.75rem] pr-[calc(env(safe-area-inset-right,0px)+var(--edge-x))] pl-[calc(env(safe-area-inset-left,0px)+var(--edge-x))] sm:[--edge-x:1.5rem] sm:[--edge-y:1.75rem] lg:[--edge-x:2.5rem] lg:[--edge-y:2.25rem]"
  style="--header-height: {headerHeight}px"
>
  <PageBackdrop />
  <KeyNavBadge label={t("common.shortcuts.mode")} />

  <div
    bind:clientHeight={headerHeight}
    class="scrim sticky top-0 z-20 -mr-[calc(env(safe-area-inset-right,0px)+var(--edge-x))] -ml-[calc(env(safe-area-inset-left,0px)+var(--edge-x))] pt-[calc(var(--status-bar)+var(--edge-y))] pr-[calc(env(safe-area-inset-right,0px)+var(--edge-x))] pb-6 pl-[calc(env(safe-area-inset-left,0px)+var(--edge-x))] sm:pb-8"
  >
    <div class="mx-auto w-full max-w-7xl">
      <AppHeader
        paging
        sticky={false}
        glyph="漢"
        title={t("common.appName")}
        subtitle={t("common.tagline")}
        items={tabs}
        value={tab}
        onpick={(route) => app.go(route)}
        settingsLabel={t("common.settings")}
        onsettings={() => (menu = true)}
        navLabel={t("common.navLabel")}
      />
    </div>
  </div>

  <main
    id="main"
    tabindex="-1"
    class="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 pb-[calc(var(--nav-bar)+var(--edge-y))] focus:outline-none sm:gap-5"
  >
    {#if app.contentFailed}
      <Card title={t("common.content.failed")}>
        <Button onclick={() => app.loadContent()}>{t("common.content.retry")}</Button>
      </Card>
    {:else if app.content === null}
      <Card title={t("common.content.loading")}>
        <p class="text-sm text-muted-foreground">{t("common.tagline")}</p>
      </Card>
    {:else if app.route === "setup"}
      <SetupScreen />
    {:else if app.route === "study"}
      <StudyScreen />
    {:else if app.route === "quiz"}
      <QuizScreen />
    {:else if app.route === "result"}
      <ResultScreen />
    {:else if app.route === "reports"}
      <ReportsScreen />
    {/if}
  </main>
</div>

{#if menu}
  <SettingsMenu labels={prefsLabels} onclose={() => (menu = false)} />
{/if}
