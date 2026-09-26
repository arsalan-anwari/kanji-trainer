import { mount } from "svelte";
import "./app.css";
import { dismissSplash } from "kaizen-ui";
import { exportFlashcards, exportRequest } from "./lib/print/export";

async function start(target: HTMLElement): Promise<void> {
  const request = await exportRequest();
  if (request !== null) return exportFlashcards(request);
  const { default: App } = await import("./App.svelte");
  mount(App, { target });
  dismissSplash();
}

const target = document.getElementById("app");
if (target === null) throw new Error("mount target is missing");

void start(target);
