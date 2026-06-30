export function applyTheme(theme) {
  const root = document.documentElement;

  root.style.setProperty("--bg", theme.background.default);
  root.style.setProperty("--panel", theme.background.paper);
  root.style.setProperty("--text", theme.text.primary);
  root.style.setProperty("--muted", theme.text.secondary);
  root.style.setProperty("--line", theme.text.disabled);
  root.style.setProperty("--accent", theme.primary.main);
  root.style.setProperty("--accent-contrast", theme.primary.contrastText);
  root.style.setProperty("--secondary", theme.secondary.main);
  root.style.setProperty("--focus", theme.primary.light);

  if (theme.mode) {
    root.dataset.themeMode = theme.mode.toLowerCase();
  }
}
