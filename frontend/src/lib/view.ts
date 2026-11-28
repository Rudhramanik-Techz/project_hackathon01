// Display settings the visitor chose. They hold nothing about a case.
export interface View {
  size: 90 | 100 | 118;
  hc: boolean;
  easy: boolean;
}

const KEY = "asli.view";

export function loadView(): View {
  const view: View = { size: 100, hc: false, easy: false };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<View>;
    if (v.size === 90 || v.size === 118) view.size = v.size;
    view.hc = v.hc === true;
    view.easy = v.easy === true;
  } catch {
    /* unreadable settings: use the defaults */
  }
  return view;
}

export function saveView(view: View): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    /* storage unavailable: settings last for this visit */
  }
}

export function applyView(view: View): void {
  const root = document.documentElement;
  root.style.fontSize = `${view.size}%`;
  root.classList.toggle("hc", view.hc);
  root.classList.toggle("easy", view.easy);
}
