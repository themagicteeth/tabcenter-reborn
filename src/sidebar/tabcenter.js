import SideTab from "./tab.js";
import TabList from "./tablist.js";
import TopMenu from "./topmenu.js";

export default class TabCenter {
  async init() {
    const search = this._search.bind(this);
    const openTab = this._openTab.bind(this);
    const getFirstTabId = this._getFirstTabId.bind(this);
    this._topMenu = new TopMenu({openTab, search, getFirstTabId});
    // Do other work while the promises are pending.
    const prefsPromise = this._readPrefs();
    const windowPromise = browser.windows.getCurrent();

    this._setupListeners();

    const {id: windowId} = await windowPromise;
    this._windowId = windowId;
    const prefs = await prefsPromise;
    this._applyPrefs(prefs);
    this._tabList = new TabList({openTab, search, prefs});
    // There's no real need to await on populate().
    this._tabList.populate(windowId).then(() => this._tabList.updateScrollShadow());

    browser.runtime.connect(
      "tabcenter-reborn@ariasuni",
      {name: this._windowId.toString()}
    );

    browser.runtime.getPlatformInfo().then((platform) => {
      document.body.setAttribute("platform", platform.os);
    });
  }

  async _openTab(props = {}) {
    if (props.afterCurrent) {
      let currentIndex = (await browser.tabs.query({
        windowId: this._windowId,
        active: true
      }))[0].index;
      props.index = currentIndex + 1;
    }
    delete props.afterCurrent;
    browser.tabs.create(props);
  }

  _search(val) {
    this._tabList.filter(val);
    this._topMenu.updateSearch(val);
  }

  _getFirstTabId() {
    return this._tabList.getFirstTabId();
  }

  _setupListeners() {
    window.addEventListener("contextmenu", (e) => {
      const target = e.target;
      // Let the searchbox input and the tabs have a context menu.
      if (!(target && (target.id === "searchbox-input" || target.id.startsWith("newtab")))
          && !SideTab.isTabEvent(e, false)) {
        e.preventDefault();
      }
    }, false);
    browser.storage.onChanged.addListener(changes => this._applyPrefs(unwrapChanges(changes)));
    this._themeListener = ({theme, windowId}) => {
      if (!windowId || windowId === this._windowId) {
        this._applyTheme(theme);
      }
    };
  }

  set _customCSS(cssText) {
    document.getElementById("customCSS").textContent = cssText;
  }

  set _darkTheme(isDarkTheme) {
    if (isDarkTheme) {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
  }

  set _themeIntegration(enabled) {
    if (!browser.theme.onUpdated) {
      return;
    }
    if (!enabled) {
      this._resetTheme();
      if (browser.theme.onUpdated.hasListener(this._themeListener)) {
        browser.theme.onUpdated.removeListener(this._themeListener);
      }
    } else {
      browser.theme.onUpdated.addListener(this._themeListener);
      browser.theme.getCurrent(this._windowId).then(this._applyTheme);
    }
  }

  _readPrefs() {
    return browser.storage.local.get({
      customCSS: "",
      darkTheme: false,
      compactModeMode: 1/* COMPACT_MODE_DYNAMIC */,
      compactPins: true,
      themeIntegration: false,
    });
  }

  _applyPrefs(prefs) {
    if (prefs.hasOwnProperty("customCSS")) {
      this._customCSS = prefs.customCSS;
    }
    if (prefs.hasOwnProperty("darkTheme")) {
      this._darkTheme = prefs.darkTheme;
    }
    if (prefs.hasOwnProperty("themeIntegration")) {
      this._themeIntegration = prefs.themeIntegration;
    }
  }

  _applyTheme(theme) {
    const setVariable = (cssVar, themeProps) => {
      for (const prop of themeProps) {
        if (theme.colors && theme.colors[prop]) {
          document.body.style.setProperty(cssVar, theme.colors[prop]);
          return;
        }
      }
      document.body.style.removeProperty(cssVar);
    };
    setVariable("--tab-background-normal", ["accentcolor"]);
    setVariable("--menu-background", ["accentcolor"]);
    setVariable("--primary-text-color", ["textcolor"]);
    setVariable("--tab-background-active", ["tab_selected", "toolbar"]);
    setVariable("--tab-text-color-active", ["tab_text", "toolbar_text"]);
    setVariable("--default-tab-line-color", ["tab_line", "accentcolor"]);
    setVariable("--searchbox-background", ["toolbar_field"]);
    setVariable("--searchbox-text-color", ["toolbar_field_text"]);
    setVariable("--tab-border-color", ["toolbar_top_separator"]);
  }

  _resetTheme() {
    this._applyTheme({});
  }

  startTests() {
    const script = document.createElement("script");
    script.src = "../test/index.js";
    document.head.appendChild(script);
  }
}

function unwrapChanges(changes) {
  const unwrapped = {};
  for (const [pref, change] of Object.entries(changes)) {
    unwrapped[pref] = change.newValue;
  }
  return unwrapped;
}
