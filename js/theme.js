import { el } from './dom.js';

export function applyTheme(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  el.sunIcon.classList.toggle("hidden", dark);
  el.moonIcon.classList.toggle("hidden", !dark);
  localStorage.setItem("mathai-theme", dark ? "dark" : "light");
}

export function initTheme() {
  const saved = localStorage.getItem("mathai-theme");
  const sys = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved ? saved === "dark" : sys);
}
