import { APPEARANCE_KEY, DEFAULT_APPEARANCE, THEME_IDS, WALLPAPER_IDS } from "./settings";
import { DEFAULT_THEME, THEMES, themeColorHex } from "./themes";

// A tiny inline script for <head>: before the first paint it reads the cached
// appearance from localStorage (also offline) and sets data-theme,
// data-wallpaper, data-text-size and the theme-color meta. The display mode is
// next-themes' (localStorage "theme"); it is only read here to pick the
// right status-bar colour.
export function bootScript() {
  const colors = Object.fromEntries(
    THEMES.map(({ id }) => [id, [themeColorHex(id, "light"), themeColorHex(id, "dark")]]),
  );
  return `(function(){try{
var d=document.documentElement,a=${JSON.stringify(DEFAULT_APPEARANCE)},c=${JSON.stringify(colors)};
try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||"{}");
if(${JSON.stringify(THEME_IDS)}.indexOf(s.theme)>-1)a.theme=s.theme;
if(${JSON.stringify(WALLPAPER_IDS)}.indexOf(s.wallpaper)>-1)a.wallpaper=s.wallpaper;
if(s.textSize>=1&&s.textSize<=4)a.textSize=s.textSize|0}catch(e){}
d.dataset.theme=a.theme;d.dataset.wallpaper=a.wallpaper;d.dataset.textSize=a.textSize;
var m="system";try{m=localStorage.getItem("theme")||"system"}catch(e){}
var dark=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
var meta=document.querySelector('meta[name="theme-color"]');
if(meta)meta.setAttribute("content",(c[a.theme]||c.${DEFAULT_THEME})[dark?1:0]);
}catch(e){}})();`;
}
