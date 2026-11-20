(function (global) {
  const THEME_KEY = "sbp:theme";
  const LANG_KEY = "sbp:lang";
  const FLAG_PX = 32;

  function parseConfigFlag(value, defaultOn) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
      if (text === "0" || text === "false" || text === "no" || text === "off") return false;
    }
    return defaultOn;
  }

  const STRINGS = {
    en: {
      "nav.home": "Home",
      "nav.plan": "Plan",
      "nav.progress": "Progress",
      "nav.ideas": "Dividend ideas",
      "nav.suggestions": "Suggestions",
      "nav.track": "Track",
      "nav.notifications": "Notifications",
      "nav.signin": "Sign in",
      "nav.signout": "Sign out",
      "nav.login": "Sign in",
      "account.menu": "Account",
      "account.change": "Change password",
      "account.current": "Current password",
      "account.new": "New password",
      "account.confirm": "Confirm new password",
      "account.save": "Update password",
      "account.saving": "Updating…",
      "account.ok": "Password updated.",
      "account.failed": "Could not change password",
      "account.mismatch": "New passwords do not match.",
      "account.wrong": "Current password is incorrect",
      "account.export": "Export data",
      "account.exportFailed": "Could not export data",
      "account.exportCsv": "Export CSV",
      "account.exportJson": "Export JSON",
      "account.import": "Import",
      "account.importHint": "Use a CSV or JSON file from Export. Buys are applied first, then sells, then watchlist.",
      "account.importOk": "Imported {buys} buys, {sells} sells, {watch} watchlist items.",
      "account.importSkipped": "Skipped {buys} buys, {sells} sells, {watch} watchlist items already present.",
      "account.importConfirm": "Import this file? Matching lots and watchlist symbols already in your account will be skipped.",
      "account.importFailed": "Could not import",
      "account.flagOn": "On",
      "account.flagOff": "Off",
      "account.flagSmtp": "Email (SMTP)",
      "account.flagExport": "Export / import",
      "account.flagDelete": "Delete account",
      "account.flagBackup": "Database backup (every {hours}h)",
      "account.smtpWait": "Password reset and monthly email stay off until SMTP is enabled. Backup does not send mail.",
      "account.flags": "App settings from config",
      "account.page": "Account",
      "account.title": "Your account",
      "account.lede": "Password, data export, and notifications live here.",
      "account.back": "Back to account",
      "account.open": "Open account",
      "account.delete": "Delete account",
      "account.deleteHint": "This permanently removes your holdings, lots, watchlist, and login. Enter your password to confirm.",
      "account.deleteConfirm": "Delete my account",
      "account.deleting": "Deleting…",
      "account.deleted": "Account deleted.",
      "home.startTitle": "Get started",
      "home.startLede": "Three steps to fill this page: plan a buy, browse ideas, then track names you care about.",
      "home.startPlan": "Plan a buy",
      "home.startIdeas": "Open Ideas",
      "home.startTrack": "Add to Track",
      "login.showPassword": "Show password",
      "login.hidePassword": "Hide password",
      "lang.en": "English",
      "lang.el": "Greek",
      "lang.choose": "Language",
      "theme.toggle": "Switch theme",
      "common.loading": "Loading…",
      "common.refresh": "Refresh",
      "common.refreshing": "Refreshing…",
      "common.refreshFailed": "Refresh failed",
      "common.failedLoad": "Failed to load",
      "common.fetching": "Fetching live data…",
      "common.prev": "Prev",
      "common.next": "Next",
      "common.search": "Search",
      "common.all": "All",
      "common.close": "Close",
      "common.yahoo": "Yahoo Finance",
      "common.stooq": "Stooq",
      "common.today": "today",
      "common.noDaily": "No daily change",
      "common.guestSignin": "<a href=\"/login\">Sign in</a> to log buys and sells. You can browse this page without an account.",
      "common.guestWatch": "<a href=\"/login\">Sign in</a> to add symbols to your personal watchlist.",
      "home.eyebrow": "Overview",
      "home.title": "Today at a glance",
      "home.lede": "Markets that moved, watchlist alerts, and this month’s plan versus buys.",
      "home.markets": "Progress by market",
      "home.openProgress": "Open Progress",
      "home.watchlist": "Watchlist",
      "home.openTrack": "Open Track",
      "home.invested": "Invested",
      "home.daily": "Daily change",
      "home.monthly": "Monthly change",
      "home.value": "Current value",
      "home.emptyMarkets": "No positions yet. Log a buy on Progress to see markets here.",
      "home.emptyWatchlist": "No symbols on your watchlist yet.",
      "home.unavailableProgress": "Progress unavailable.",
      "home.unavailableWatch": "Watchlist unavailable.",
      "plan.eyebrow": "Stock Buy Planner",
      "plan.title": "How much do you need each month?",
      "plan.titleYear": "How much do you need each year?",
      "plan.lede": "Pick a stock, set how many shares you want and over how many months. We pull a live price and estimate monthly growth from recent history.",
      "plan.ledeYear": "Pick a stock, set how many shares you want and over how many years. We pull a live price and estimate yearly growth from recent history.",
      "plan.ticker": "Ticker",
      "plan.priceSource": "Price source",
      "plan.yearly": "Buy once per year",
      "plan.shares": "Total shares",
      "plan.months": "Months",
      "plan.years": "Years",
      "plan.month": "Month",
      "plan.year": "Year",
      "plan.lookback": "History lookback (months)",
      "plan.growth": "Growth override % / month",
      "plan.growthYear": "Growth override % / year",
      "plan.growthHint": "Leave blank to use historical estimate",
      "plan.submit": "Calculate plan",
      "plan.placeholder": "Enter a ticker and hit calculate. Defaults are set to Deutsche Telekom (<strong>DTE.DE</strong>): 50 shares over 10 months.",
      "plan.placeholderYear": "Enter a ticker and hit calculate. Defaults are set to Deutsche Telekom (<strong>DTE.DE</strong>): 50 shares over 10 years.",
      "plan.price": "Price",
      "plan.sharesBought": "Shares bought",
      "plan.cost": "Cost",
      "plan.owned": "Owned",
      "plan.portfolio": "Portfolio",
      "plan.invested": "Invested",
      "plan.monthGrowth": "Month growth",
      "plan.yearGrowth": "Year growth",
      "plan.accumGrowth": "Accum. growth",
      "plan.dividends": "Dividends",
      "plan.divHint": "Open to load yield and payout history",
      "plan.divOpen": "Open this section to load dividend data.",
      "plan.divNone": "No dividends reported",
      "plan.disclaimer": "Projections use live market data and a historical average monthly return. Past performance is not a guarantee of future results.",
      "plan.disclaimerYear": "Projections use live market data and a historical average yearly return (compounded from monthly history). Past performance is not a guarantee of future results.",
      "plan.source": "Source: {source}",
      "plan.yield": "Yield {value}",
      "progress.eyebrow": "Your buys & sells",
      "progress.title": "Track what you already own",
      "progress.lede": "Log buys and sells. Sells use FIFO against your oldest lots, update remaining shares, and record realized gain or loss.",
      "progress.loading": "Loading portfolio…",
      "progress.loadingLive": "Loading live prices…",
      "progress.logBuy": "Log a purchase",
      "progress.logSell": "Log a sale",
      "progress.buy": "Buy",
      "progress.sell": "Sell",
      "progress.ticker": "Ticker",
      "progress.sharesBought": "Shares bought",
      "progress.sharesSold": "Shares sold",
      "progress.priceShare": "Price / share",
      "progress.blankLive": "Blank = live price",
      "progress.purchaseDate": "Purchase date",
      "progress.sellDate": "Sell date",
      "progress.notes": "Notes",
      "progress.useLive": "Use live price",
      "progress.saveBuy": "Save purchase",
      "progress.saveSell": "Save sale",
      "progress.savingBuy": "Saving…",
      "progress.savingSell": "Saving sale…",
      "progress.byCurrency": "Progress by currency",
      "progress.refreshMins": "Live prices refresh every {n} minutes in the background.",
      "progress.lots": "Remaining buy lots",
      "progress.lotsHint": "Open to view remaining lots",
      "progress.lotsEmpty": "Open this section to view remaining buy lots.",
      "progress.history": "Transaction history",
      "progress.historyHint": "Open to load buys & sells",
      "progress.historyEmpty": "Open this section to load transaction history.",
      "progress.openHoldings": "Open holdings",
      "progress.holdings": "Holdings",
      "progress.date": "Date",
      "progress.type": "Type",
      "progress.stock": "Stock",
      "progress.currency": "Currency",
      "progress.shares": "Shares",
      "progress.price": "Price",
      "progress.amount": "Amount",
      "progress.result": "Result",
      "progress.noLots": "No remaining buy lots.",
      "progress.noLotsMatch": "No matching buy lots.",
      "progress.noTx": "No transactions found.",
      "progress.noTxMatch": "No matching transactions.",
      "progress.noItems": "No items",
      "progress.noMatches": "No matches",
      "progress.noLotsYet": "No remaining lots",
      "progress.noTxYet": "No transactions yet",
      "progress.signinHistory": "Sign in to view history",
      "progress.openDetails": "Open for details",
      "progress.investedC": "Invested ({c})",
      "progress.liveC": "Live value ({c})",
      "progress.unrealC": "Unrealized ({c})",
      "progress.realC": "Realized ({c})",
      "progress.divC": "Dividends earned ({c})",
      "progress.usdTax": "US companies: net of 30% withholding (ADRs excluded)",
      "progress.eurTax": "EU companies: net of 5% withholding",
      "progress.meta": "{open} open · {buys} buys · {sells} sells",
      "progress.holdingsCount": "{n} holdings",
      "progress.holdingOne": "{n} holding",
      "progress.lotsCount": "{n} remaining lots · open to view",
      "progress.lotOne": "{n} remaining lot · open to view",
      "progress.emptyPositions": "No positions yet. Log a buy or sell to see progress by currency.",
      "progress.avgCost": "Avg cost",
      "progress.livePrice": "Live price",
      "progress.value": "Value",
      "progress.unrealized": "Unrealized",
      "progress.realized": "Realized",
      "progress.divYield": "Dividend yield",
      "progress.divNet": "Div. earned (net)",
      "progress.divPct": "Div. % of invested",
      "progress.earned": "earned",
      "progress.lotsLabel": "Lots",
      "progress.lotN": "{n} lots",
      "progress.lot1": "{n} lot",
      "progress.noHoldingsC": "No open holdings in {c}.",
      "progress.loadHoldings": "Loading live holdings…",
      "progress.failHoldings": "Failed to load holdings.",
      "progress.sellAvail": "Available to sell: ",
      "progress.avgCostHint": "avg cost",
      "progress.enterOwn": "Enter a ticker you own to sell.",
      "progress.noPos": "No open position for {symbol}.",
      "progress.usdRule": "Enter USD price (VUAA.EU rule)",
      "progress.eurRule": "Enter EUR price (DTE.DE)",
      "progress.dteEur": "DTE.DE prices are always treated as EUR.",
      "progress.deleteLot": "Delete this remaining buy lot?",
      "progress.deleted": "Buy lot deleted.",
      "progress.deleteFailed": "Delete failed",
      "progress.saveFailed": "Save failed",
      "progress.quoteFailed": "Could not fetch quote",
      "progress.liveFailed": "Could not fetch live price",
      "progress.refreshed": "Refreshed data at {time}",
      "progress.pctToday": "% today",
      "ideas.eyebrow": "Quality income shortlist",
      "ideas.title": "Dividend ideas",
      "ideas.lede": "Curated quality-dividend names, not a live index rank. See Suggestions for that list.",
      "ideas.loading": "Loading dividend ideas…",
      "ideas.owned": "Owned",
      "ideas.previewUs": "Preview · US",
      "ideas.previewEu": "Preview · EU",
      "ideas.ownedTitle": "Already in your portfolio",
      "ideas.noMatch": "No matching stocks here yet.",
      "ideas.stocksN": "{n} stocks",
      "ideas.divY": "Div {y}",
      "ideas.ownedShares": "Owned shares",
      "ideas.colStock": "Stock",
      "ideas.colPrice": "Price",
      "ideas.col6m": "6m change",
      "ideas.colYield": "Yield",
      "ideas.ready": "Ready",
      "ideas.failed": "Failed",
      "ideas.ownedN": "{n} owned",
      "ideas.updated": "Updated {time} · {owned}",
      "ideas.noChanges": "No changes · checked {time} · {owned}",
      "ideas.board": "board {time}",
      "suggestions.eyebrow": "Multi-source shortlist",
      "suggestions.title": "Suggestions",
      "suggestions.lede": "Live index and provider ranks. Not a buy list. For a curated dividend board, open Dividend ideas.",
      "suggestions.loading": "Loading suggestions…",
      "suggestions.stocks": "Stocks",
      "suggestions.etfs": "ETFs",
      "suggestions.funds": "Mutual funds",
      "suggestions.yield": "Yield",
      "suggestions.yieldDist": "Yield / dist.",
      "suggestions.expense": "Expense",
      "suggestions.feeds": "Selection & data feeds",
      "suggestions.ranked": "Symbols last ranked {time}",
      "suggestions.nextRank": "next rank {time}",
      "suggestions.heading": "Suggestions",
      "suggestions.showing": "Showing {shown} of {total}",
      "suggestions.itemsN": "{total} items",
      "suggestions.colName": "Name",
      "suggestions.colSource": "List source",
      "suggestions.colWhy": "Why picked",
      "suggestions.whyTip": "6-month momentum is the price change over the last six months. The score ranks each name by size, that momentum, and how actively it trades. A higher score means a higher place on this shortlist.",
      "suggestions.whyTipEtfs": "ETFs are ranked by assets under management, trading liquidity, and lower fees. A higher score means a stronger mix of those factors.",
      "suggestions.whyTipFunds": "Mutual funds are ranked by assets under management, recent returns, and fees. A higher score means a stronger mix of those factors.",
      "suggestions.reasonMomentum": "Ranked by size + 6m momentum (score {score})",
      "suggestions.reasonIndex": "Ranked from live index constituents",
      "suggestions.reasonEtfFees": "Ranked by AUM, liquidity, low fees ({expense}% exp.)",
      "suggestions.reasonEtf": "Ranked by AUM and liquidity",
      "suggestions.reasonFundFees": "Ranked by AUM, returns, fees ({expense}% exp.)",
      "suggestions.reasonFund": "Ranked from provider fund universe",
      "suggestions.colTheme": "Theme",
      "suggestions.colPrice": "Price",
      "suggestions.col6m": "6m change",
      "suggestions.colData": "Price data",
      "suggestions.scrollMore": "Scroll for more…",
      "suggestions.noTab": "No data for this tab.",
      "suggestions.emptyTab": "No suggestions in this tab yet.",
      "suggestions.quotes": "Quotes {time} · {count} symbols",
      "suggestions.rankedAt": "ranked {time}",
      "suggestions.disclaimer": "Suggestions are rebuilt from live index constituents (Wikipedia) and provider fund universes, then ranked by market data every {hours} hours. Quotes refresh about every {minutes} minutes from Yahoo Finance with Stooq fallback. Not investment advice.",
      "list.search": "Search",
      "list.sort": "Sort",
      "list.sortName": "Name",
      "list.sortYield": "Yield",
      "list.sort6m": "6m change",
      "list.sortScore": "Score",
      "list.track": "Track",
      "list.trackShort": "Track",
      "list.trackedShort": "Tracked",
      "list.plan": "Plan",
      "list.tracked": "Tracked",
      "guest.trackCta": "<a href=\"/login\">Sign in</a> to save this symbol to Track.",
      "guest.trackCtaPlain": "Sign in to save symbols to Track.",
      "home.briefing": "This month",
      "home.thisMonth": "{symbol}: {bought} of {target} shares bought this month.",
      "home.thisMonthOpen": "Open plan for {symbol}",
      "home.thisMonthNone": "No open monthly plan. Calculate a plan, then log buys on Progress.",
      "home.budgetMonth": "{name}: {spent} of {budget} invested this month ·",
      "home.budgetOpen": "Open budget",
      "home.budgetNone": "No active budget plan. Set a monthly amount and the stocks you intend to buy, then log buys on Progress.",
      "home.budgetStart": "Create a budget",
      "home.movers": "Watchlist movers",
      "home.noMovers": "No large moves on your watchlist today.",
      "home.title": "Today at a glance",
      "home.lede": "Markets that moved, watchlist alerts, and this month’s plan versus buys.",
      "ideas.vsSuggestions": "Curated dividend board. For live index ranks, use Suggestions.",
      "suggestions.vsIdeas": "Live index rank, not a buy list. For a curated dividend board, use Dividend ideas.",
      "ideas.inSuggestions": "Suggestions",
      "plan.logBuy": "Log this month’s buy",
      "plan.openIdeas": "Ideas",
      "plan.openSuggestions": "Suggestions",
      "progress.thisMonth": "This month {bought} / {target} planned shares",
      "progress.openPlan": "Plan",
      "progress.openIdeas": "Ideas",
      "progress.openSuggestions": "Suggestions",
      "row.errorMuted": "Quote failed",
      "notifications.inAppOnly": "Email delivery is off. This page does not send mail until SMTP is enabled.",
      "notifications.eyebrowOff": "In-app only",
      "sheet.asOf": "As of {time} · {source}",
      "sheet.stale": "Stale",
      "sheet.noPlan": "No open monthly plan for this symbol.",
      "sheet.yearlyPlan": "This plan is yearly, so there is no monthly lot target.",
      "sheet.notHeld": "Not in Progress",
      "sheet.noLots": "No remaining lots.",
      "sheet.planShares": "{n} shares over {periods} months",
      "sheet.market": "Market",
      "sheet.position": "Your position",
      "sheet.income": "Dividends on this holding",
      "sheet.sold": "Sold",
      "sheet.history": "Transactions",
      "sheet.invested": "Invested",
      "sheet.prevClose": "Previous close",
      "sheet.dayPnl": "Day P&L",
      "sheet.monthChange": "1 month",
      "sheet.monthPnl": "1-month P&L",
      "sheet.yieldOnCost": "Yield on cost",
      "sheet.avgMonthly": "Avg monthly growth",
      "sheet.lookback": "Lookback",
      "sheet.lookbackN": "{n} months",
      "sheet.divGross": "Div. earned (gross)",
      "sheet.divTax": "Withholding tax",
      "sheet.withholding": "Withholding",
      "sheet.recentDiv": "Dividend events",
      "sheet.noDivEvents": "No dividend events on these lots.",
      "sheet.soldShares": "Shares sold",
      "sheet.saleCount": "Sales",
      "sheet.noSales": "No sales logged for this symbol.",
      "sheet.openHistory": "Open full transaction history",
      "sheet.noHistory": "No buys or sells logged for this symbol.",
      "sheet.perShare": "Per share",
      "sheet.plan": "Plan",
      "login.forgotOff": "Password reset by email is off until SMTP is enabled.",
      "login.noRecovery": "Password recovery is not possible while smtp.enabled is false. We cannot email a reset link. Choose a password you will remember.",
      "forgot.smtpOff": "Reset emails are not sent while smtp.enabled is false. Password recovery is not possible from this page.",
      "reset.smtpOff": "This page is only for a link from a reset email. Those emails are not sent while smtp.enabled is false.",
      "notifications.smtpOff": "Monthly report emails are not sent while smtp.enabled is false. You can still use the app in the browser.",
      "home.quotesOk": "Quotes are fresh.",
      "home.quotesDelayed": "Quotes delayed — prices may be stale.",
      "home.quotesUnknown": "Quotes have not refreshed yet.",
      "list.added": "Added {symbol}",
      "list.disclaimerMore": "How this list works",
      "list.actions": "Actions",
      "ideas.method": "A curated quality-dividend board. Live prices and cash dividends, split by what you already own versus US and EU previews.",
      "ideas.tabAll": "All",
      "ideas.falling": "Last full year of dividends is lower than the year before.",
      "ideas.fallingShort": "Down vs last full year",
      "ideas.trend": "Div. trend",
      "suggestions.method": "Live index and provider lists, re-ranked by size, 6-month momentum, and liquidity. Not a buy list.",
      "suggestions.colScore": "Score",
      "suggestions.hideHeld": "Hide owned & tracked",
      "suggestions.filterRegion": "Region",
      "suggestions.filterTheme": "Theme",
      "suggestions.allRegions": "All regions",
      "suggestions.allThemes": "All themes",
      "suggestions.whyShort": "Size + 6m momentum",
      "suggestions.whyShortEtf": "AUM, liquidity, fees",
      "suggestions.whyShortFund": "AUM, returns, fees",
      "compare.col": "Compare",
      "compare.title": "Compare in this area",
      "compare.add": "Compare",
      "compare.clear": "Clear",
      "compare.needTwo": "Pick 2–4 names in the same region and theme.",
      "compare.max": "You can compare up to {n} names.",
      "compare.sameArea": "Stay in {region} · {theme}. Clear the strip to change area.",
      "compare.fx": "These quotes use different currencies. Do not compare prices directly.",
      "compare.note": "Same region and theme only. Higher score is a ranking aid, not a recommendation.",
      "compare.remove": "Remove {symbol}",
      "suggestions.tip6m": "Price change over the last six months, using live market data.",
      "suggestions.tipYield": "Trailing dividend or distribution yield from the latest available data.",
      "suggestions.tipSource": "The index or provider list this symbol was taken from.",
      "help.unrealized": "Paper gain or loss if you sold at the current live price. It is not locked in until you sell.",
      "help.realized": "Gain or loss already booked from completed sells (FIFO against older lots).",
      "common.failed": "Failed",
      "common.requestFailed": "Request failed",
      "common.somethingWrong": "Something went wrong",
      "common.symbolsN": "{n} symbols",
      "common.symbolOne": "{n} symbol",
      "plan.calculating": "Calculating…",
      "plan.requestFailed": "Request failed",
      "plan.divFailed": "Failed to load dividends",
      "progress.failPositions": "Failed to load positions",
      "progress.failTx": "Failed to load transactions",
      "progress.failProgress": "Failed to load progress",
      "progress.failLots": "Failed to load lots",
      "progress.savedNoRefresh": "Saved, but the list could not refresh. Reload the page.",
      "progress.vuaaUsd": "VUAA.EU prices are always treated as USD (resolved to VUAA.L).",
      "ideas.colStock": "Stock",
      "ideas.colPrice": "Price",
      "ideas.col6m": "6m change",
      "ideas.colYield": "Yield",
      "ideas.disclaimer": "Curated quality dividend names, not investment advice. “Lower risk” is relative. The current year is year-to-date only. Owned matches your Progress open lots. Live data is checked every {minutes} minutes and the board every {hours} hours — the UI updates only when values actually change.",
      "track.disclaimer": "Tracked symbols are stored locally. Live prices and percentage changes use the source chosen for each symbol (Yahoo Finance or Stooq). Past performance is not a guarantee of future results.",
      "track.emptyGuest": "No symbols on your watchlist yet. Sign in to start tracking, or browse other pages freely.",
      "track.empty": "No symbols yet. Add a stock, ETF, or mutual fund above.",
      "track.updated": "Updated {time} · {count}",
      "track.ready": "Ready",
      "theme.Technology": "Technology",
      "theme.Healthcare": "Health Care",
      "theme.Health Care": "Health Care",
      "theme.Financials": "Financials",
      "theme.Energy": "Energy",
      "theme.Consumer": "Consumer",
      "theme.Consumer staples": "Consumer staples",
      "theme.Equity": "Equity",
      "theme.Information Technology": "Information Technology",
      "theme.US total market": "US total market",
      "theme.US large cap": "US large cap",
      "theme.US growth": "US growth",
      "theme.US value": "US value",
      "theme.US mid cap": "US mid cap",
      "theme.US small cap": "US small cap",
      "theme.US bonds": "US bonds",
      "theme.Ex-US equities": "Ex-US equities",
      "theme.Developed ex-US": "Developed ex-US",
      "theme.Emerging markets": "Emerging markets",
      "theme.Dividend equity": "Dividend equity",
      "theme.Gold": "Gold",
      "theme.Global equity": "Global equity",
      "theme.Developed world": "Developed world",
      "theme.Europe equity": "Europe equity",
      "theme.Income / options": "Income / options",
      "theme.US large cap index": "US large cap index",
      "theme.US growth active": "US growth active",
      "theme.Multi-sector bonds": "Multi-sector bonds",
      "theme.Balanced": "Balanced",
      "theme.Blend": "Blend",
      "theme.Cash / money market": "Cash / money market",
      "track.eyebrow": "Personal watchlist",
      "track.title": "Track stocks, ETFs & funds",
      "track.lede": "Add symbols you want to follow. Cards are grouped by market and sorted A–Z. Click a card for full performance details.",
      "track.add": "Add to watchlist",
      "track.ticker": "Ticker",
      "track.tickerHint": "e.g. AAPL, VUAA.DE",
      "track.type": "Type",
      "track.auto": "Auto-detect",
      "track.stock": "Stock",
      "track.etf": "ETF",
      "track.fund": "Mutual fund",
      "track.addSymbol": "Add symbol",
      "track.loading": "Loading watchlist…",
      "track.dateAdded": "Date added",
      "track.livePrice": "Live price",
      "track.priceAtAdd": "Price at add",
      "track.sinceAdded": "Since added",
      "track.1m": "1 month",
      "track.6m": "6 months",
      "track.1y": "1 year",
      "track.currency": "Currency",
      "track.priceSource": "Price source",
      "track.remove": "Remove from watchlist",
      "track.removeConfirm": "Remove this symbol from your watchlist?",
      "track.removeFailed": "Remove failed",
      "track.addFailed": "Could not add symbol",
      "track.viewDetails": "View details for {name}",
      "notifications.eyebrow": "Email alerts",
      "notifications.title": "Notifications",
      "notifications.lede": "Get a monthly snapshot of your Progress holdings by email.",
      "notifications.monthly": "Monthly report",
      "notifications.enable": "Enable monthly report",
      "notifications.enableHint": "Same holdings and totals as your Progress page, delivered by email.",
      "notifications.email": "Delivery email",
      "notifications.emailHint": "Leave blank to use your account email.",
      "notifications.schedule": "Sent on the 1st of each month at midnight.",
      "notifications.save": "Save preferences",
      "notifications.saving": "Saving…",
      "notifications.loadError": "Could not load notification settings.",
      "notifications.saveError": "Could not save notification settings.",
      "notifications.lastSent": "Last report sent for {month}.",
      "notifications.enabled": "Monthly reports enabled. You will receive an email on the 1st of each month.",
      "notifications.disabled": "Monthly reports disabled.",
      "notifications.emailOff": "Email is disabled for now. Thank you",
      "login.title": "Sign in",
      "login.lede": "Each account has its own portfolio, watchlist, and progress data.",
      "login.create": "Create account",
      "login.email": "Email",
      "login.password": "Password",
      "login.forgot": "Forgot password?",
      "login.rules": "At least 10 characters with upper & lower case, 2 numbers (not adjacent), and 2 symbols.",
      "login.signing": "Signing in…",
      "login.creating": "Creating account…",
      "login.failed": "Authentication failed",
      "forgot.title": "Forgot your password?",
      "forgot.lede": "Enter the email for your account. If it exists, we will send a reset link.",
      "forgot.send": "Send reset link",
      "forgot.back": "Back to sign in",
      "forgot.failed": "Could not send reset email",
      "reset.title": "Choose a new password",
      "reset.lede": "Enter and confirm your new password. The reset hash from your email is sent with the request.",
      "reset.new": "New password",
      "reset.confirm": "Confirm password",
      "reset.submit": "Change password",
      "reset.failed": "Could not reset password",
      "nav.budget": "Budget",
      "nav.pricing": "Pricing",
      "nav.help": "Help",
      "pricing.eyebrow": "Monthly investing",
      "pricing.title": "Stick to your monthly plan",
      "pricing.lede": "Set your budget and stocks, log buys on Progress, and see what you spent, what you set aside, and what dividends paid.",
      "pricing.disclaimer": "Not investment advice. Live quotes and FX can be delayed or missing.",
      "pricing.bullet1": "Budget plans from start month to end month",
      "pricing.bullet2": "Per-stock monthly targets and on-track months",
      "pricing.bullet3": "Set-aside cash and dividends in the plan window",
      "pricing.freeName": "Free",
      "pricing.freePrice": "€0",
      "pricing.forever": "forever",
      "pricing.freeF1": "Plan calculator (single stock)",
      "pricing.freeF2": "Progress: log buys and sells",
      "pricing.freeF3": "1 budget plan, up to 24 months",
      "pricing.freeF4": "Ideas, Suggestions, Track (10 symbols)",
      "pricing.freeF5": "JSON export",
      "pricing.startFree": "Create free account",
      "pricing.proBadge": "Recommended",
      "pricing.proName": "Pro",
      "pricing.proPrice": "€1.99",
      "pricing.perMonth": "/ month",
      "pricing.yearly": "or €19.99 / year when billing is live · 14-day trial",
      "pricing.proF1": "Unlimited budget plans",
      "pricing.proF2": "Plans up to 10 years",
      "pricing.proF3": "Monthly email report",
      "pricing.proF4": "Track up to 50 symbols",
      "pricing.proF5": "Projection and full budget analytics",
      "pricing.upgrade": "Upgrade to Pro",
      "pricing.signInUpgrade": "Sign in to upgrade",
      "pricing.alreadyPro": "You have Pro",
      "pricing.billingSoon": "Stripe billing is not configured on this server yet. Use Pricing when checkout is enabled.",
      "pricing.checkoutFailed": "Could not start checkout",
      "pricing.checkoutMonthly": "Subscribe monthly ({provider})",
      "pricing.checkoutYearly": "Subscribe yearly — save with {provider}",
      "billing.upgradeHint": "See Pricing to upgrade to Pro.",
      "billing.proRequired": "Pro is required for this feature.",
      "billing.genericError": "Something went wrong. Try again.",
      "billing.portalFailed": "Could not open billing portal.",
      "pricing.trustTitle": "How we calculate",
      "pricing.trustBody": "FIFO lots, trade-date FX, and budget matching are documented so you can trust the numbers.",
      "pricing.readHelp": "Read the calculations guide",
      "help.eyebrow": "Transparency",
      "help.title": "How we calculate",
      "help.lede": "Numbers on Budget and Progress come from your logged trades and these rules. They are illustrative, not tax or investment advice.",
      "help.budgetTitle": "Budget plans",
      "help.budgetP1": "A plan has a start and end calendar month, an optional monthly amount, and optional per-stock monthly targets. Each month in the window gets the same monthly budget unless you leave the amount blank — then the budget is the sum of your stock rows.",
      "help.budgetP2": "Buys logged in Progress are matched to a month by purchase date. Spending counts toward the plan if the symbol is listed on the plan, or if “count other stocks” is enabled. Otherwise those buys are reported separately and do not reduce the monthly budget.",
      "help.budgetP3": "Set-aside is money from past months you did not invest (budget minus spent). A month is on track when every listed stock reached its target, or the full monthly budget was invested for plans without stock rows.",
      "help.fxTitle": "Currencies and FX",
      "help.fxP1": "Each buy stores its trading currency. Budget totals use your plan currency. Amounts convert using the exchange rate on the trade date when available; if a historical rate is missing, today’s rate is used and you’ll see a warning.",
      "help.fxP2": "Dividends use the payout date rate. Live portfolio value uses today’s rate. GBp (pence) quotes are treated as GBP.",
      "help.fifoTitle": "Progress lots (FIFO)",
      "help.fifoP1": "Open lots are first-in-first-out. A sell reduces the oldest lots first and records realized gain using those lot prices.",
      "help.fifoP2": "Budget “invested so far” includes spending on buys inside the plan window even if you later sold those shares. Sells after the allocations feature keep historical spend via sale lot records; older sells before that upgrade may not restore full spent amounts.",
      "help.divTitle": "Dividends",
      "help.divP1": "During the plan window, dividends count if you held the share on the pay date, the buy was on or before the pay date, and the lot had not been fully sold before payout. Net amounts apply your dividend withholding % from Account settings.",
      "help.liveTitle": "Live prices",
      "help.liveP1": "Quotes come from Yahoo Finance or Stooq depending on symbol settings. Growth, projection, and market value depend on live data and can show “—” when a quote fails.",
      "help.disclaimer": "Past performance does not guarantee future results.",
      "help.backPricing": "See pricing",
      "welcome.eyebrow": "Welcome",
      "welcome.title": "Three steps to your first month",
      "welcome.lede": "Pick how you want to start. You can use all three over time.",
      "welcome.stepBudget": "Create a monthly budget (recommended)",
      "welcome.stepBudgetBody": "Set months, amount, and the stocks you buy each month.",
      "welcome.openBudget": "Open Budget",
      "welcome.stepPlan": "Or plan one stock first",
      "welcome.stepPlanBody": "Use the Plan calculator for a single ticker and DCA schedule.",
      "welcome.openPlan": "Open Plan",
      "welcome.stepProgress": "Log a buy",
      "welcome.stepProgressBody": "Progress is where real purchases count toward your budget.",
      "welcome.openProgress": "Open Progress",
      "welcome.done": "Go to Home",
      "welcome.help": "How we calculate",
      "footer.tagline": "Monthly investing discipline",
      "footer.pricing": "Pricing",
      "footer.help": "How we calculate",
      "footer.terms": "Terms",
      "footer.privacy": "Privacy",
      "footer.plan": "Plan calculator",
      "legal.termsTitle": "Terms of use",
      "legal.privacyTitle": "Privacy policy",
      "legal.draft": "Draft for launch — review with counsel before going live.",
      "legal.termsBody": "Stock Buy Planner provides planning and tracking tools only. It does not provide investment, tax, or legal advice. You are responsible for your own investment decisions. The service is provided as-is without warranty.",
      "legal.privacyBody": "We store account email (encrypted), portfolio data, and preferences to run the service. Export or delete your data from Account. Payment processing uses Stripe under their privacy policy when billing is enabled.",
      "account.planTitle": "Your plan",
      "account.upgrade": "Upgrade to Pro",
      "account.manageBilling": "Manage billing",
      "account.helpTitle": "Help & data",
      "account.helpBody": "How numbers are calculated, pricing, and your export.",
      "account.helpCalc": "How we calculate",
      "account.tierFree": "Free — one budget plan and core tracking",
      "account.tierPro": "Pro — unlimited plans and email reports",
      "account.tierUnknown": "Could not load plan status",
      "budget.eyebrow": "Monthly budget",
      "budget.title": "Invest the same amount every month",
      "budget.lede": "Set a start and end month, the money you have each month, and the stocks you intend to buy. Your buys from Progress are matched automatically.",
      "budget.loading": "Loading your budget…",
      "budget.loadingLive": "Loading buys, dividends and live prices…",
      "budget.updatedAt": "Updated {time}",
      "budget.disclaimer": "Buys, dividends and live value come from your Progress lots. Amounts in other currencies are converted at the rate of each trade or payout date. Not investment advice.",
      "budget.yourPlans": "Your plans",
      "budget.newPlan": "New plan",
      "budget.noPlans": "No plans yet. Create your first one below.",
      "budget.chipThisMonth": "This month: {spent} of {budget}",
      "budget.chipTotal": "Invested {spent}",
      "budget.perMonthShort": "mo",
      "budget.perMonth": "{amount} per month",
      "budget.phase.upcoming": "Upcoming",
      "budget.phase.active": "Active",
      "budget.phase.ended": "Ended",
      "budget.state.done": "Done",
      "budget.state.partial": "Partial",
      "budget.state.missed": "Missed",
      "budget.state.pending": "Pending",
      "budget.formNew": "New plan",
      "budget.formEdit": "Edit plan",
      "budget.name": "Plan name (optional)",
      "budget.start": "Start month",
      "budget.end": "End month",
      "budget.monthsOne": "{n} month",
      "budget.monthsN": "{n} months",
      "budget.windowInvalid": "The end month must be on or after the start month, at most 10 years later.",
      "budget.monthFormat": "Use the format YYYY-MM.",
      "budget.amount": "Monthly amount",
      "budget.amountHint": "Optional. Leave blank to use the total of the stocks below.",
      "budget.currency": "Currency",
      "budget.items": "Stocks to buy each month",
      "budget.addItem": "Add stock",
      "budget.ticker": "Ticker",
      "budget.itemAmount": "Per month ({c})",
      "budget.removeItem": "Remove stock",
      "budget.includeUnplanned": "Count buys of other stocks toward this budget",
      "budget.allocEmpty": "Add a monthly amount or at least one stock to see how the money is split.",
      "budget.allocPlanned": "Stocks {planned} of {budget} per month",
      "budget.allocAuto": "No monthly amount set, so the budget is the total of your stocks.",
      "budget.allocOver": "Stocks exceed the monthly amount by {amount}.",
      "budget.allocFree": "{amount} per month stays aside as cash.",
      "budget.allocExact": "The whole monthly amount is allocated to stocks.",
      "budget.allocTotal": "{total} in total over {n} months.",
      "budget.cancel": "Cancel",
      "budget.save": "Save plan",
      "budget.update": "Save changes",
      "budget.saving": "Saving…",
      "budget.created": "Plan created.",
      "budget.updated": "Plan saved.",
      "budget.delete": "Delete plan",
      "budget.deleteConfirm": "Delete “{name}”? Your buys and dividends stay in Progress.",
      "budget.deleted": "Plan deleted.",
      "budget.errMonths": "Choose a start and an end month.",
      "budget.errOrder": "The end month must be on or after the start month.",
      "budget.errLong": "A plan can cover at most {n} months.",
      "budget.errAmount": "Enter a valid monthly amount, or leave it blank.",
      "budget.errTicker": "Enter a ticker for every stock row, or remove the empty row.",
      "budget.errItemAmount": "Enter a monthly amount above zero for {symbol}.",
      "budget.errDuplicate": "{symbol} is listed more than once.",
      "budget.errEmpty": "Add a monthly amount or at least one stock.",
      "budget.errTooMany": "A plan can hold up to {n} stocks.",
      "budget.countsAll": "Counts all buys",
      "budget.countsPlanned": "Counts planned stocks only",
      "budget.edit": "Edit",
      "budget.overall": "Overall progress",
      "budget.investedOfTotal": "Invested of the full plan",
      "budget.timeElapsed": "Time elapsed",
      "budget.monthsOf": "{n} of {total} months",
      "budget.paceOn": "On pace",
      "budget.paceBehind": "Behind pace",
      "budget.paceAhead": "Ahead of pace",
      "budget.kpiInvested": "Invested so far",
      "budget.kpiInvestedSub": "{pct} of {budget} budgeted to date",
      "budget.tipInvested": "Money spent on buys inside the plan window, including shares you sold later.",
      "budget.kpiSetAside": "Set aside",
      "budget.setAsideSub": "+{amount} still open this month",
      "budget.tipSetAside": "Budget from finished months that you did not invest. A negative amount means you invested more than planned.",
      "budget.kpiDividends": "Dividends received",
      "budget.dividendsSub": "After {amount} withholding tax",
      "budget.tipDividends": "Net dividends paid during the plan on shares bought in the plan, after your withholding tax setting.",
      "budget.kpiValue": "Market value",
      "budget.kpiValueSub": "Cost {cost}",
      "budget.tipValue": "Live value of the plan shares you still hold.",
      "budget.kpiGrowth": "Growth",
      "budget.kpiReturn": "Total return",
      "budget.tipReturn": "Price growth plus gains booked from sells plus dividends received.",
      "budget.kpiCash": "Cash available",
      "budget.tipCash": "Money not invested so far (including what is left this month), plus dividends and sale proceeds.",
      "budget.kpiOnTrack": "Months on track",
      "budget.kpiOnTrackSub": "Finished months that hit every target",
      "budget.kpiOnTrackNone": "No finished months yet",
      "budget.tipOnTrack": "A month is on track when every planned stock reached its monthly amount, or the full budget was invested for plans without stocks.",
      "budget.streak": "{n} months in a row",
      "budget.startsTitle": "Starts in {month}",
      "budget.startsIn": "Your plan begins in {n} months. Monthly targets show here once it starts.",
      "budget.startsInOne": "Your plan begins next month. Monthly targets show here once it starts.",
      "budget.endedTitle": "Plan ended in {month}",
      "budget.endedLede": "You invested {spent} of the {budget} budget.",
      "budget.thisMonth": "This month · {month}",
      "budget.dayLeft": "{n} day left",
      "budget.daysLeft": "{n} days left",
      "budget.monthLeft": "{amount} left",
      "budget.monthOver": "{amount} over budget",
      "budget.estShares": "≈ {shares} shares at {price}",
      "budget.toGo": "{amount} to go",
      "budget.lineDone": "Target reached",
      "budget.logBuy": "Log buy",
      "budget.unplannedThisMonth": "Includes {amount} of buys outside the plan.",
      "budget.noBuysYet": "No buys inside this plan yet. Log purchases in Progress and they count automatically.",
      "budget.openProgress": "Open Progress",
      "budget.chartTitle": "Invested per month",
      "budget.legendOn": "On track",
      "budget.legendUnder": "Under budget",
      "budget.legendOver": "Over budget",
      "budget.legendBudget": "Monthly budget",
      "budget.stocksTitle": "Stocks in this plan",
      "budget.unplanned": "Unplanned",
      "budget.ofTarget": "of {amount}",
      "budget.boughtShares": "{n} bought",
      "budget.colMonthly": "Per month",
      "budget.colInvested": "Invested",
      "budget.colAvgCost": "Avg cost",
      "budget.colValue": "Value",
      "budget.colGrowth": "Growth",
      "budget.colDividends": "Dividends",
      "budget.monthsTitle": "Month by month",
      "budget.monthsHint": "Budget, buys and dividends for every month",
      "budget.now": "Now",
      "budget.colMonth": "Month",
      "budget.colBudget": "Budget",
      "budget.colLeft": "Left",
      "budget.tipLeft": "Budget minus the amount invested that month.",
      "budget.colSetAside": "Set aside",
      "budget.colStocks": "Stocks",
      "budget.projTitle": "If you keep going until {month}",
      "budget.projInvested": "Total invested",
      "budget.projValue": "Estimated value",
      "budget.projGain": "Estimated growth",
      "budget.projDividends": "Yearly dividends",
      "budget.projCash": "Cash set aside",
      "budget.projDisclaimer": "Estimate from your plan amounts, each stock's average past monthly growth and its current dividend yield. Markets can fall; this is not a forecast.",
      "budget.warnFx": "Historical {list} → {c} rates were missing for some dates, so today's rate was used.",
      "budget.warnQuotes": "Live prices are unavailable for {list}; their value is left out.",
      "budget.warnExcluded": "{n} buys ({amount}) of stocks outside the plan are not counted.",
      "budget.warnExcludedOne": "1 buy ({amount}) of a stock outside the plan is not counted.",
      "budget.introTitle": "Plan your monthly investing",
      "budget.step1": "Pick the period",
      "budget.step1Body": "Choose the start and end month and, if you like, how much you can invest each month.",
      "budget.step2": "Add the stocks",
      "budget.step2Body": "List the stocks you intend to buy every month and the amount for each. Money you don't allocate is tracked as cash set aside.",
      "budget.step3": "Track it live",
      "budget.step3Body": "Log buys in Progress as usual. This page shows what you spent, what you set aside, the dividends you received and how the plan grows.",
      "budget.upgradeHint": "See Pricing to upgrade to Pro.",
    },
    el: {
      "nav.home": "Αρχική",
      "nav.plan": "Σχέδιο",
      "nav.progress": "Πρόοδος",
      "nav.ideas": "Ιδέες μερίσματος",
      "nav.suggestions": "Προτάσεις",
      "nav.track": "Παρακολούθηση",
      "nav.notifications": "Ειδοποιήσεις",
      "nav.signin": "Σύνδεση",
      "nav.signout": "Αποσύνδεση",
      "nav.login": "Σύνδεση",
      "account.menu": "Λογαριασμός",
      "account.change": "Αλλαγή κωδικού",
      "account.current": "Τρέχων κωδικός",
      "account.new": "Νέος κωδικός",
      "account.confirm": "Επιβεβαίωση νέου κωδικού",
      "account.save": "Ενημέρωση κωδικού",
      "account.saving": "Ενημέρωση…",
      "account.ok": "Ο κωδικός ενημερώθηκε.",
      "account.failed": "Αδυναμία αλλαγής κωδικού",
      "account.mismatch": "Οι νέοι κωδικοί δεν ταιριάζουν.",
      "account.wrong": "Ο τρέχων κωδικός είναι λάθος",
      "account.export": "Εξαγωγή δεδομένων",
      "account.exportFailed": "Αδυναμία εξαγωγής",
      "account.exportCsv": "Εξαγωγή CSV",
      "account.exportJson": "Εξαγωγή JSON",
      "account.import": "Εισαγωγή",
      "account.importHint": "Χρησιμοποιήστε CSV ή JSON από την εξαγωγή. Πρώτα αγορές, μετά πωλήσεις, μετά λίστα.",
      "account.importOk": "Εισήχθησαν {buys} αγορές, {sells} πωλήσεις, {watch} στοιχεία λίστας.",
      "account.importSkipped": "Παραλείφθηκαν {buys} αγορές, {sells} πωλήσεις, {watch} στοιχεία που υπάρχουν ήδη.",
      "account.importConfirm": "Εισαγωγή αυτού του αρχείου; Οι παρτίδες και τα σύμβολα που υπάρχουν ήδη θα παραλειφθούν.",
      "account.importFailed": "Αδυναμία εισαγωγής",
      "account.flagOn": "Ενεργό",
      "account.flagOff": "Ανενεργό",
      "account.flagSmtp": "Email (SMTP)",
      "account.flagExport": "Εξαγωγή / εισαγωγή",
      "account.flagDelete": "Διαγραφή λογαριασμού",
      "account.flagBackup": "Αντίγραφο βάσης (κάθε {hours} ώρες)",
      "account.smtpWait": "Η επαναφορά κωδικού και το μηνιαίο email μένουν ανενεργά ώσπου να ενεργοποιηθεί το SMTP. Το αντίγραφο δεν στέλνει mail.",
      "account.flags": "Ρυθμίσεις από το config",
      "account.page": "Λογαριασμός",
      "account.title": "Ο λογαριασμός σας",
      "account.lede": "Κωδικός, εξαγωγή δεδομένων και ειδοποιήσεις βρίσκονται εδώ.",
      "account.back": "Επιστροφή στον λογαριασμό",
      "account.open": "Άνοιγμα λογαριασμού",
      "account.delete": "Διαγραφή λογαριασμού",
      "account.deleteHint": "Αυτό αφαιρεί μόνιμα θέσεις, παρτίδες, λίστα παρακολούθησης και σύνδεση. Εισαγάγετε τον κωδικό για επιβεβαίωση.",
      "account.deleteConfirm": "Διαγραφή του λογαριασμού μου",
      "account.deleting": "Διαγραφή…",
      "account.deleted": "Ο λογαριασμός διαγράφηκε.",
      "home.startTitle": "Ξεκινήστε",
      "home.startLede": "Τρία βήματα για αυτή τη σελίδα: σχεδιάστε αγορά, δείτε ιδέες, προσθέστε σύμβολα στην παρακολούθηση.",
      "home.startPlan": "Σχεδιασμός αγοράς",
      "home.startIdeas": "Άνοιγμα Ιδεών",
      "home.startTrack": "Προσθήκη στην Παρακολούθηση",
      "login.showPassword": "Εμφάνιση κωδικού",
      "login.hidePassword": "Απόκρυψη κωδικού",
      "lang.en": "Αγγλικά",
      "lang.el": "Ελληνικά",
      "lang.choose": "Γλώσσα",
      "theme.toggle": "Αλλαγή θέματος",
      "common.loading": "Φόρτωση…",
      "common.refresh": "Ανανέωση",
      "common.refreshing": "Ανανέωση…",
      "common.refreshFailed": "Η ανανέωση απέτυχε",
      "common.failedLoad": "Αποτυχία φόρτωσης",
      "common.fetching": "Λήψη ζωντανών δεδομένων…",
      "common.prev": "Προηγ.",
      "common.next": "Επόμ.",
      "common.search": "Αναζήτηση",
      "common.all": "Όλα",
      "common.close": "Κλείσιμο",
      "common.yahoo": "Yahoo Finance",
      "common.stooq": "Stooq",
      "common.today": "σήμερα",
      "common.noDaily": "Χωρίς ημερήσια μεταβολή",
      "common.guestSignin": "<a href=\"/login\">Συνδεθείτε</a> για αγορές και πωλήσεις. Μπορείτε να δείτε τη σελίδα χωρίς λογαριασμό.",
      "common.guestWatch": "<a href=\"/login\">Συνδεθείτε</a> για να προσθέσετε σύμβολα στη λίστα σας.",
      "home.eyebrow": "Επισκόπηση",
      "home.title": "Σήμερα με μια ματιά",
      "home.lede": "Αγορές που κινήθηκαν, ειδοποιήσεις λίστας και το σχέδιο του μήνα έναντι αγορών.",
      "home.markets": "Πρόοδος ανά αγορά",
      "home.openProgress": "Άνοιγμα προόδου",
      "home.watchlist": "Λίστα παρακολούθησης",
      "home.openTrack": "Άνοιγμα παρακολούθησης",
      "home.invested": "Επενδυμένο",
      "home.daily": "Ημερήσια μεταβολή",
      "home.monthly": "Μηνιαία μεταβολή",
      "home.value": "Τρέχουσα αξία",
      "home.emptyMarkets": "Δεν υπάρχουν θέσεις ακόμη. Καταχωρίστε αγορά στην Πρόοδο.",
      "home.emptyWatchlist": "Δεν υπάρχουν σύμβολα στη λίστα ακόμη.",
      "home.unavailableProgress": "Η πρόοδος δεν είναι διαθέσιμη.",
      "home.unavailableWatch": "Η λίστα δεν είναι διαθέσιμη.",
      "plan.eyebrow": "Stock Buy Planner",
      "plan.title": "Πόσα χρειάζεστε κάθε μήνα;",
      "plan.titleYear": "Πόσα χρειάζεστε κάθε χρόνο;",
      "plan.lede": "Επιλέξτε μετοχή, πόσες μετοχές θέλετε και σε πόσους μήνες. Παίρνουμε ζωντανή τιμή και εκτιμούμε τη μηνιαία ανάπτυξη.",
      "plan.ledeYear": "Επιλέξτε μετοχή, πόσες μετοχές θέλετε και σε πόσα έτη. Παίρνουμε ζωντανή τιμή και εκτιμούμε την ετήσια ανάπτυξη.",
      "plan.ticker": "Σύμβολο",
      "plan.priceSource": "Πηγή τιμής",
      "plan.yearly": "Αγορά μία φορά τον χρόνο",
      "plan.shares": "Συνολικές μετοχές",
      "plan.months": "Μήνες",
      "plan.years": "Έτη",
      "plan.month": "Μήνας",
      "plan.year": "Έτος",
      "plan.lookback": "Ιστορικό (μήνες)",
      "plan.growth": "Παράκαμψη ανάπτυξης % / μήνα",
      "plan.growthYear": "Παράκαμψη ανάπτυξης % / έτος",
      "plan.growthHint": "Αφήστε κενό για την ιστορική εκτίμηση",
      "plan.submit": "Υπολογισμός σχεδίου",
      "plan.placeholder": "Εισαγάγετε σύμβολο και πατήστε υπολογισμό. Προεπιλογή: Deutsche Telekom (<strong>DTE.DE</strong>): 50 μετοχές σε 10 μήνες.",
      "plan.placeholderYear": "Εισαγάγετε σύμβολο και πατήστε υπολογισμό. Προεπιλογή: Deutsche Telekom (<strong>DTE.DE</strong>): 50 μετοχές σε 10 έτη.",
      "plan.price": "Τιμή",
      "plan.sharesBought": "Μετοχές που αγοράστηκαν",
      "plan.cost": "Κόστος",
      "plan.owned": "Κατοχή",
      "plan.portfolio": "Χαρτοφυλάκιο",
      "plan.invested": "Επενδυμένο",
      "plan.monthGrowth": "Μηνιαία ανάπτυξη",
      "plan.yearGrowth": "Ετήσια ανάπτυξη",
      "plan.accumGrowth": "Σωρευτική ανάπτυξη",
      "plan.dividends": "Μερίσματα",
      "plan.divHint": "Ανοίξτε για απόδοση και ιστορικό πληρωμών",
      "plan.divOpen": "Ανοίξτε αυτή την ενότητα για δεδομένα μερισμάτων.",
      "plan.divNone": "Δεν αναφέρονται μερίσματα",
      "plan.disclaimer": "Οι προβλέψεις χρησιμοποιούν ζωντανά δεδομένα και μέση μηνιαία απόδοση. Η προηγούμενη απόδοση δεν εγγυάται μελλοντικά αποτελέσματα.",
      "plan.disclaimerYear": "Οι προβλέψεις χρησιμοποιούν ζωντανά δεδομένα και μέση ετήσια απόδοση. Η προηγούμενη απόδοση δεν εγγυάται μελλοντικά αποτελέσματα.",
      "plan.source": "Πηγή: {source}",
      "plan.yield": "Απόδοση {value}",
      "progress.eyebrow": "Αγορές και πωλήσεις",
      "progress.title": "Παρακολουθήστε ό,τι κατέχετε",
      "progress.lede": "Καταχωρίστε αγορές και πωλήσεις. Οι πωλήσεις χρησιμοποιούν FIFO στις παλαιότερες παρτίδες.",
      "progress.loading": "Φόρτωση χαρτοφυλακίου…",
      "progress.loadingLive": "Φόρτωση ζωντανών τιμών…",
      "progress.logBuy": "Καταχώριση αγοράς",
      "progress.logSell": "Καταχώριση πώλησης",
      "progress.buy": "Αγορά",
      "progress.sell": "Πώληση",
      "progress.ticker": "Σύμβολο",
      "progress.sharesBought": "Μετοχές που αγοράστηκαν",
      "progress.sharesSold": "Μετοχές που πουλήθηκαν",
      "progress.priceShare": "Τιμή / μετοχή",
      "progress.blankLive": "Κενό = ζωντανή τιμή",
      "progress.purchaseDate": "Ημερομηνία αγοράς",
      "progress.sellDate": "Ημερομηνία πώλησης",
      "progress.notes": "Σημειώσεις",
      "progress.useLive": "Χρήση ζωντανής τιμής",
      "progress.saveBuy": "Αποθήκευση αγοράς",
      "progress.saveSell": "Αποθήκευση πώλησης",
      "progress.savingBuy": "Αποθήκευση…",
      "progress.savingSell": "Αποθήκευση πώλησης…",
      "progress.byCurrency": "Πρόοδος ανά νόμισμα",
      "progress.refreshMins": "Οι τιμές ανανεώνονται κάθε {n} λεπτά στο παρασκήνιο.",
      "progress.lots": "Υπόλοιπες παρτίδες αγοράς",
      "progress.lotsHint": "Ανοίξτε για τις υπόλοιπες παρτίδες",
      "progress.lotsEmpty": "Ανοίξτε αυτή την ενότητα για τις υπόλοιπες παρτίδες.",
      "progress.history": "Ιστορικό συναλλαγών",
      "progress.historyHint": "Ανοίξτε για αγορές και πωλήσεις",
      "progress.historyEmpty": "Ανοίξτε αυτή την ενότητα για το ιστορικό συναλλαγών.",
      "progress.openHoldings": "Ανοιχτές θέσεις",
      "progress.holdings": "Θέσεις",
      "progress.date": "Ημερομηνία",
      "progress.type": "Τύπος",
      "progress.stock": "Μετοχή",
      "progress.currency": "Νόμισμα",
      "progress.shares": "Μετοχές",
      "progress.price": "Τιμή",
      "progress.amount": "Ποσό",
      "progress.result": "Αποτέλεσμα",
      "progress.noLots": "Δεν υπάρχουν υπόλοιπες παρτίδες.",
      "progress.noLotsMatch": "Καμία αντίστοιχη παρτίδα.",
      "progress.noTx": "Δεν βρέθηκαν συναλλαγές.",
      "progress.noTxMatch": "Καμία αντίστοιχη συναλλαγή.",
      "progress.noItems": "Κανένα στοιχείο",
      "progress.noMatches": "Κανένα αποτέλεσμα",
      "progress.noLotsYet": "Χωρίς υπόλοιπες παρτίδες",
      "progress.noTxYet": "Χωρίς συναλλαγές ακόμη",
      "progress.signinHistory": "Συνδεθείτε για να δείτε το ιστορικό",
      "progress.openDetails": "Άνοιγμα λεπτομερειών",
      "progress.investedC": "Επενδυμένο ({c})",
      "progress.liveC": "Ζωντανή αξία ({c})",
      "progress.unrealC": "Μη πραγματοποιημένο ({c})",
      "progress.realC": "Πραγματοποιημένο ({c})",
      "progress.divC": "Μερίσματα ({c})",
      "progress.usdTax": "ΗΠΑ: καθαρό μετά από παρακράτηση 30% (χωρίς ADR)",
      "progress.eurTax": "ΕΕ: καθαρό μετά από παρακράτηση 5%",
      "progress.meta": "{open} ανοιχτές · {buys} αγορές · {sells} πωλήσεις",
      "progress.holdingsCount": "{n} θέσεις",
      "progress.holdingOne": "{n} θέση",
      "progress.lotsCount": "{n} υπόλοιπες παρτίδες · ανοίξτε για προβολή",
      "progress.lotOne": "{n} υπόλοιπη παρτίδα · ανοίξτε για προβολή",
      "progress.emptyPositions": "Δεν υπάρχουν θέσεις ακόμη. Καταχωρίστε αγορά ή πώληση.",
      "progress.avgCost": "Μέσο κόστος",
      "progress.livePrice": "Ζωντανή τιμή",
      "progress.value": "Αξία",
      "progress.unrealized": "Μη πραγματοποιημένο",
      "progress.realized": "Πραγματοποιημένο",
      "progress.divYield": "Μερισματική απόδοση",
      "progress.divNet": "Μερίσματα (καθαρά)",
      "progress.divPct": "Μερίσματα % επένδυσης",
      "progress.earned": "εισπράχθηκαν",
      "progress.lotsLabel": "Παρτίδες",
      "progress.lotN": "{n} παρτίδες",
      "progress.lot1": "{n} παρτίδα",
      "progress.noHoldingsC": "Δεν υπάρχουν ανοιχτές θέσεις σε {c}.",
      "progress.loadHoldings": "Φόρτωση θέσεων…",
      "progress.failHoldings": "Αποτυχία φόρτωσης θέσεων.",
      "progress.sellAvail": "Διαθέσιμο προς πώληση: ",
      "progress.avgCostHint": "μέσο κόστος",
      "progress.enterOwn": "Εισαγάγετε σύμβολο που κατέχετε για πώληση.",
      "progress.noPos": "Δεν υπάρχει ανοιχτή θέση για {symbol}.",
      "progress.usdRule": "Εισαγάγετε τιμή USD (κανόνας VUAA.EU)",
      "progress.eurRule": "Εισαγάγετε τιμή EUR (DTE.DE)",
      "progress.dteEur": "Οι τιμές DTE.DE αντιμετωπίζονται πάντα ως EUR.",
      "progress.deleteLot": "Διαγραφή αυτής της υπόλοιπης παρτίδας;",
      "progress.deleted": "Η παρτίδα διαγράφηκε.",
      "progress.deleteFailed": "Η διαγραφή απέτυχε",
      "progress.saveFailed": "Η αποθήκευση απέτυχε",
      "progress.quoteFailed": "Αδυναμία λήψης τιμής",
      "progress.liveFailed": "Αδυναμία λήψης ζωντανής τιμής",
      "progress.refreshed": "Ανανέωση στις {time}",
      "progress.pctToday": "% σήμερα",
      "ideas.eyebrow": "Επιλεγμένο εισόδημα",
      "ideas.title": "Ιδέες μερίσματος",
      "ideas.lede": "Επιλεγμένα ονόματα μερίσματος, όχι ζωντανή κατάταξη δείκτη. Για αυτό δείτε Προτάσεις.",
      "ideas.loading": "Φόρτωση ιδεών μερίσματος…",
      "ideas.owned": "Κατοχή",
      "ideas.previewUs": "Προεπισκόπηση · ΗΠΑ",
      "ideas.previewEu": "Προεπισκόπηση · ΕΕ",
      "ideas.ownedTitle": "Ήδη στο χαρτοφυλάκιό σας",
      "ideas.noMatch": "Δεν υπάρχουν αντίστοιχες μετοχές εδώ ακόμη.",
      "ideas.stocksN": "{n} μετοχές",
      "ideas.divY": "Μερ. {y}",
      "ideas.ownedShares": "Μετοχές κατοχής",
      "ideas.colStock": "Μετοχή",
      "ideas.colPrice": "Τιμή",
      "ideas.col6m": "Μεταβολή 6μ",
      "ideas.colYield": "Απόδοση",
      "ideas.ready": "Έτοιμο",
      "ideas.failed": "Αποτυχία",
      "ideas.ownedN": "{n} σε κατοχή",
      "ideas.updated": "Ενημέρωση {time} · {owned}",
      "ideas.noChanges": "Χωρίς αλλαγές · έλεγχος {time} · {owned}",
      "ideas.board": "πίνακας {time}",
      "suggestions.eyebrow": "Πολλαπλές πηγές",
      "suggestions.title": "Προτάσεις",
      "suggestions.lede": "Ζωντανή κατάταξη δεικτών και παρόχων. Δεν είναι λίστα αγοράς. Για επιλεγμένα μερίσματα ανοίξτε Ιδέες μερίσματος.",
      "suggestions.loading": "Φόρτωση προτάσεων…",
      "suggestions.stocks": "Μετοχές",
      "suggestions.etfs": "ETF",
      "suggestions.funds": "Αμοιβαία κεφάλαια",
      "suggestions.yield": "Απόδοση",
      "suggestions.yieldDist": "Απόδοση / διανομή",
      "suggestions.expense": "Έξοδα",
      "suggestions.feeds": "Επιλογή και πηγές δεδομένων",
      "suggestions.ranked": "Τελευταία κατάταξη {time}",
      "suggestions.nextRank": "επόμενη κατάταξη {time}",
      "suggestions.heading": "Προτάσεις",
      "suggestions.showing": "Εμφάνιση {shown} από {total}",
      "suggestions.itemsN": "{total} στοιχεία",
      "suggestions.colName": "Όνομα",
      "suggestions.colSource": "Πηγή λίστας",
      "suggestions.colWhy": "Γιατί επιλέχθηκε",
      "suggestions.whyTip": "Η ορμή 6 μηνών (momentum) είναι η μεταβολή της τιμής τους τελευταίους έξι μήνες. Η βαθμολογία (score) κατατάσσει κάθε τίτλο με βάση το μέγεθος, αυτή την ορμή και την εμπορευσιμότητα. Υψηλότερη βαθμολογία σημαίνει υψηλότερη θέση στη λίστα.",
      "suggestions.whyTipEtfs": "Τα ETF κατατάσσονται με βάση τα υπό διαχείριση κεφάλαια, την εμπορευσιμότητα και τα χαμηλότερα έξοδα. Υψηλότερη βαθμολογία σημαίνει ισχυρότερο συνδυασμό αυτών των παραγόντων.",
      "suggestions.whyTipFunds": "Τα αμοιβαία κατατάσσονται με βάση τα υπό διαχείριση κεφάλαια, τις πρόσφατες αποδόσεις και τα έξοδα. Υψηλότερη βαθμολογία σημαίνει ισχυρότερο συνδυασμό αυτών των παραγόντων.",
      "suggestions.reasonMomentum": "Κατάταξη κατά μέγεθος + ορμή 6μ (βαθμός {score})",
      "suggestions.reasonIndex": "Κατάταξη από ζωντανές συνθέσεις δεικτών",
      "suggestions.reasonEtfFees": "Κατάταξη κατά AUM, εμπορευσιμότητα, χαμηλά έξοδα ({expense}% έξοδα)",
      "suggestions.reasonEtf": "Κατάταξη κατά AUM και εμπορευσιμότητα",
      "suggestions.reasonFundFees": "Κατάταξη κατά AUM, αποδόσεις, έξοδα ({expense}% έξοδα)",
      "suggestions.reasonFund": "Κατάταξη από universe παρόχου",
      "suggestions.colTheme": "Θέμα",
      "suggestions.colPrice": "Τιμή",
      "suggestions.col6m": "Μεταβολή 6μ",
      "suggestions.colData": "Πηγή τιμής",
      "suggestions.scrollMore": "Κύλιση για περισσότερα…",
      "suggestions.noTab": "Δεν υπάρχουν δεδομένα σε αυτή την καρτέλα.",
      "suggestions.emptyTab": "Δεν υπάρχουν προτάσεις σε αυτή την καρτέλα ακόμη.",
      "suggestions.quotes": "Τιμές {time} · {count} σύμβολα",
      "suggestions.rankedAt": "κατάταξη {time}",
      "suggestions.disclaimer": "Οι προτάσεις ανακατασκευάζονται από συνθέσεις δεικτών (Wikipedia) και universes παρόχων και κατατάσσονται με δεδομένα αγοράς κάθε {hours} ώρες. Οι τιμές ανανεώνονται περίπου κάθε {minutes} λεπτά από Yahoo Finance με εναλλακτική το Stooq. Δεν αποτελεί επενδυτική συμβουλή.",
      "list.search": "Αναζήτηση",
      "list.sort": "Ταξινόμηση",
      "list.sortName": "Όνομα",
      "list.sortYield": "Απόδοση",
      "list.sort6m": "Μεταβολή 6μ",
      "list.sortScore": "Βαθμός",
      "list.track": "Παρακολούθηση",
      "list.trackShort": "Λίστα",
      "list.trackedShort": "Στη λίστα",
      "list.plan": "Σχέδιο",
      "list.tracked": "Στη λίστα",
      "guest.trackCta": "<a href=\"/login\">Συνδεθείτε</a> για να αποθηκεύσετε το σύμβολο στη λίστα.",
      "guest.trackCtaPlain": "Συνδεθείτε για αποθήκευση στη λίστα.",
      "home.briefing": "Αυτόν τον μήνα",
      "home.thisMonth": "{symbol}: {bought} από {target} μετοχές αγοράστηκαν αυτόν τον μήνα.",
      "home.thisMonthOpen": "Άνοιγμα σχεδίου για {symbol}",
      "home.thisMonthNone": "Δεν υπάρχει ανοιχτό μηνιαίο σχέδιο. Υπολογίστε ένα σχέδιο και καταγράψτε αγορές στην Πρόοδο.",
      "home.budgetMonth": "{name}: {spent} από {budget} επενδύθηκαν αυτόν τον μήνα ·",
      "home.budgetOpen": "Άνοιγμα προϋπολογισμού",
      "home.budgetNone": "Δεν υπάρχει ενεργό πλάνο προϋπολογισμού. Ορίστε μηνιαίο ποσό και τις μετοχές που σκοπεύετε να αγοράσετε και καταγράψτε αγορές στην Πρόοδο.",
      "home.budgetStart": "Δημιουργία προϋπολογισμού",
      "home.movers": "Κινήσεις λίστας",
      "home.noMovers": "Δεν υπάρχουν μεγάλες κινήσεις σήμερα.",
      "home.title": "Σήμερα με μια ματιά",
      "home.lede": "Αγορές που κινήθηκαν, ειδοποιήσεις λίστας και το σχέδιο του μήνα έναντι αγορών.",
      "ideas.vsSuggestions": "Επιλεγμένος πίνακας μερισμάτων. Για ζωντανή κατάταξη δεικτών, δείτε Προτάσεις.",
      "suggestions.vsIdeas": "Ζωντανή κατάταξη δεικτών, όχι λίστα αγοράς. Για επιλεγμένα μερίσματα, δείτε Ιδέες μερίσματος.",
      "ideas.inSuggestions": "Προτάσεις",
      "plan.logBuy": "Καταγραφή αγοράς μήνα",
      "plan.openIdeas": "Ιδέες",
      "plan.openSuggestions": "Προτάσεις",
      "progress.thisMonth": "Αυτόν τον μήνα {bought} / {target} προγραμματισμένες μετοχές",
      "progress.openPlan": "Σχέδιο",
      "progress.openIdeas": "Ιδέες",
      "progress.openSuggestions": "Προτάσεις",
      "row.errorMuted": "Αποτυχία τιμής",
      "notifications.inAppOnly": "Η αποστολή email είναι ανενεργή. Η σελίδα δεν στέλνει μηνύματα μέχρι να ενεργοποιηθεί το SMTP.",
      "notifications.eyebrowOff": "Μόνο στην εφαρμογή",
      "sheet.asOf": "Στις {time} · {source}",
      "sheet.stale": "Παρωχημένο",
      "sheet.noPlan": "Δεν υπάρχει ανοιχτό μηνιαίο σχέδιο για αυτό το σύμβολο.",
      "sheet.yearlyPlan": "Το σχέδιο είναι ετήσιο, χωρίς μηνιαίο στόχο παρτίδας.",
      "sheet.notHeld": "Όχι στην Πρόοδο",
      "sheet.noLots": "Δεν υπάρχουν εναπομείνασες παρτίδες.",
      "sheet.planShares": "{n} μετοχές σε {periods} μήνες",
      "sheet.market": "Αγορά",
      "sheet.position": "Η θέση σας",
      "sheet.income": "Μερίσματα αυτής της θέσης",
      "sheet.sold": "Πωλήσεις",
      "sheet.history": "Συναλλαγές",
      "sheet.invested": "Επενδυμένο",
      "sheet.prevClose": "Προηγ. κλείσιμο",
      "sheet.dayPnl": "Ημερήσιο P&L",
      "sheet.monthChange": "1 μήνας",
      "sheet.monthPnl": "P&L 1 μήνα",
      "sheet.yieldOnCost": "Απόδοση κόστους",
      "sheet.avgMonthly": "Μέση μηνιαία αύξηση",
      "sheet.lookback": "Ιστορικό",
      "sheet.lookbackN": "{n} μήνες",
      "sheet.divGross": "Μερίσματα (μικτά)",
      "sheet.divTax": "Παρακράτηση φόρου",
      "sheet.withholding": "Παρακράτηση",
      "sheet.recentDiv": "Γεγονότα μερισμάτων",
      "sheet.noDivEvents": "Δεν υπάρχουν μερίσματα σε αυτές τις παρτίδες.",
      "sheet.soldShares": "Πωλημένες μετοχές",
      "sheet.saleCount": "Πωλήσεις",
      "sheet.noSales": "Δεν υπάρχουν πωλήσεις για αυτό το σύμβολο.",
      "sheet.openHistory": "Πλήρες ιστορικό συναλλαγών",
      "sheet.noHistory": "Δεν υπάρχουν αγορές ή πωλήσεις για αυτό το σύμβολο.",
      "sheet.perShare": "Ανά μετοχή",
      "sheet.plan": "Σχέδιο",
      "login.forgotOff": "Η επαναφορά κωδικού με email είναι ανενεργή μέχρι να ενεργοποιηθεί το SMTP.",
      "login.noRecovery": "Η ανάκτηση κωδικού δεν είναι δυνατή όσο το smtp.enabled είναι false. Δεν μπορούμε να στείλουμε σύνδεσμο επαναφοράς. Επιλέξτε κωδικό που θα θυμάστε.",
      "forgot.smtpOff": "Δεν αποστέλλονται email επαναφοράς όσο το smtp.enabled είναι false. Η ανάκτηση κωδικού δεν είναι δυνατή από αυτή τη σελίδα.",
      "reset.smtpOff": "Η σελίδα αυτή είναι μόνο για σύνδεσμο από email επαναφοράς. Τα email αυτά δεν στέλνονται όσο το smtp.enabled είναι false.",
      "notifications.smtpOff": "Τα μηνιαία email αναφοράς δεν στέλνονται όσο το smtp.enabled είναι false. Μπορείτε να χρησιμοποιείτε την εφαρμογή στο πρόγραμμα περιήγησης.",
      "home.quotesOk": "Οι τιμές είναι ενημερωμένες.",
      "home.quotesDelayed": "Καθυστέρηση τιμών — μπορεί να είναι παρωχημένες.",
      "home.quotesUnknown": "Οι τιμές δεν έχουν ανανεωθεί ακόμη.",
      "list.added": "Προστέθηκε {symbol}",
      "list.disclaimerMore": "Πώς φτιάχνεται η λίστα",
      "list.actions": "Ενέργειες",
      "ideas.method": "Επιλεγμένος πίνακας ποιοτικών μερισμάτων. Ζωντανές τιμές και μετρητά μερίσματα, χωρισμένα σε ό,τι κατέχετε και προεπισκοπήσεις ΗΠΑ / ΕΕ.",
      "ideas.tabAll": "Όλα",
      "ideas.falling": "Το τελευταίο πλήρες έτος μερισμάτων είναι χαμηλότερο από το προηγούμενο.",
      "ideas.fallingShort": "Πτώση vs πλήρες έτος",
      "ideas.trend": "Τάση μερίσματος",
      "suggestions.method": "Ζωντανοί δείκτες και λίστες παρόχων, με νέα κατάταξη κατά μέγεθος, ορμή 6 μηνών και εμπορευσιμότητα. Δεν είναι λίστα αγοράς.",
      "suggestions.colScore": "Βαθμός",
      "suggestions.hideHeld": "Απόκρυψη κατοχής και παρακολούθησης",
      "suggestions.filterRegion": "Περιοχή",
      "suggestions.filterTheme": "Θέμα",
      "suggestions.allRegions": "Όλες οι περιοχές",
      "suggestions.allThemes": "Όλα τα θέματα",
      "suggestions.whyShort": "Μέγεθος + ορμή 6μ",
      "suggestions.whyShortEtf": "AUM, εμπορευσιμότητα, έξοδα",
      "suggestions.whyShortFund": "AUM, αποδόσεις, έξοδα",
      "compare.col": "Σύγκριση",
      "compare.title": "Σύγκριση στην ίδια περιοχή",
      "compare.add": "Σύγκριση",
      "compare.clear": "Καθαρισμός",
      "compare.needTwo": "Επιλέξτε 2–4 ονόματα στην ίδια περιοχή και θέμα.",
      "compare.max": "Μπορείτε να συγκρίνετε έως {n} ονόματα.",
      "compare.sameArea": "Μείνετε σε {region} · {theme}. Καθαρίστε τη λωρίδα για αλλαγή περιοχής.",
      "compare.fx": "Οι τιμές είναι σε διαφορετικά νομίσματα. Μην συγκρίνετε τις τιμές απευθείας.",
      "compare.note": "Μόνο ίδια περιοχή και θέμα. Ο υψηλότερος βαθμός είναι βοήθημα κατάταξης, όχι σύσταση.",
      "compare.remove": "Αφαίρεση {symbol}",
      "suggestions.tip6m": "Μεταβολή τιμής τους τελευταίους έξι μήνες, από ζωντανά δεδομένα αγοράς.",
      "suggestions.tipYield": "Μερισματική ή διανεμητική απόδοση από τα πιο πρόσφατα διαθέσιμα δεδομένα.",
      "suggestions.tipSource": "Ο δείκτης ή η λίστα παρόχου από την οποία προήλθε το σύμβολο.",
      "help.unrealized": "Λογιστικό κέρδος ή ζημία αν πουλούσατε στην τρέχουσα τιμή. Δεν κατοχυρώνεται πριν την πώληση.",
      "help.realized": "Κέρδος ή ζημία που έχει ήδη κατοχυρωθεί από ολοκληρωμένες πωλήσεις (FIFO).",
      "common.failed": "Αποτυχία",
      "common.requestFailed": "Το αίτημα απέτυχε",
      "common.somethingWrong": "Κάτι πήγε στραβά",
      "common.symbolsN": "{n} σύμβολα",
      "common.symbolOne": "{n} σύμβολο",
      "plan.calculating": "Υπολογισμός…",
      "plan.requestFailed": "Το αίτημα απέτυχε",
      "plan.divFailed": "Αποτυχία φόρτωσης μερισμάτων",
      "progress.failPositions": "Αποτυχία φόρτωσης θέσεων",
      "progress.failTx": "Αποτυχία φόρτωσης συναλλαγών",
      "progress.failProgress": "Αποτυχία φόρτωσης προόδου",
      "progress.failLots": "Αποτυχία φόρτωσης παρτίδων",
      "progress.savedNoRefresh": "Αποθηκεύτηκε, αλλά η λίστα δεν ανανεώθηκε. Ανανεώστε τη σελίδα.",
      "progress.vuaaUsd": "Οι τιμές VUAA.EU αντιμετωπίζονται πάντα ως USD (VUAA.L).",
      "ideas.colStock": "Μετοχή",
      "ideas.colPrice": "Τιμή",
      "ideas.col6m": "Μεταβολή 6μ",
      "ideas.colYield": "Απόδοση",
      "ideas.disclaimer": "Επιλεγμένα ονόματα μερίσματος, όχι επενδυτική συμβουλή. Ο «χαμηλότερος κίνδυνος» είναι σχετικός. Το τρέχον έτος είναι μέχρι σήμερα. Η κατοχή αντιστοιχεί στις ανοιχτές παρτίδες της Προόδου. Τα ζωντανά δεδομένα ελέγχονται κάθε {minutes} λεπτά και ο πίνακας κάθε {hours} ώρες.",
      "track.disclaimer": "Τα σύμβολα αποθηκεύονται τοπικά. Οι ζωντανές τιμές χρησιμοποιούν την πηγή που επιλέξατε (Yahoo Finance ή Stooq). Η προηγούμενη απόδοση δεν εγγυάται μελλοντικά αποτελέσματα.",
      "track.emptyGuest": "Δεν υπάρχουν σύμβολα στη λίστα. Συνδεθείτε για να ξεκινήσετε, ή περιηγηθείτε ελεύθερα.",
      "track.empty": "Δεν υπάρχουν σύμβολα ακόμη. Προσθέστε μετοχή, ETF ή αμοιβαίο παραπάνω.",
      "track.updated": "Ενημέρωση {time} · {count}",
      "track.ready": "Έτοιμο",
      "theme.Technology": "Τεχνολογία",
      "theme.Healthcare": "Υγεία",
      "theme.Health Care": "Υγεία",
      "theme.Financials": "Χρηματοοικονομικά",
      "theme.Energy": "Ενέργεια",
      "theme.Consumer": "Καταναλωτικά",
      "theme.Consumer staples": "Βασικά καταναλωτικά",
      "theme.Equity": "Μετοχές",
      "theme.Information Technology": "Πληροφορική",
      "theme.US total market": "Συνολική αγορά ΗΠΑ",
      "theme.US large cap": "Μεγάλη κεφαλαιοποίηση ΗΠΑ",
      "theme.US growth": "Ανάπτυξη ΗΠΑ",
      "theme.US value": "Αξία ΗΠΑ",
      "theme.US mid cap": "Μεσαία κεφαλαιοποίηση ΗΠΑ",
      "theme.US small cap": "Μικρή κεφαλαιοποίηση ΗΠΑ",
      "theme.US bonds": "Ομόλογα ΗΠΑ",
      "theme.Ex-US equities": "Μετοχές εκτός ΗΠΑ",
      "theme.Developed ex-US": "Ανεπτυγμένες εκτός ΗΠΑ",
      "theme.Emerging markets": "Αναδυόμενες αγορές",
      "theme.Dividend equity": "Μερισματικές μετοχές",
      "theme.Gold": "Χρυσός",
      "theme.Global equity": "Παγκόσμιες μετοχές",
      "theme.Developed world": "Ανεπτυγμένος κόσμος",
      "theme.Europe equity": "Ευρωπαϊκές μετοχές",
      "theme.Income / options": "Εισόδημα / δικαιώματα",
      "theme.US large cap index": "Δείκτης μεγάλης κεφαλαιοποίησης ΗΠΑ",
      "theme.US growth active": "Ενεργητική ανάπτυξη ΗΠΑ",
      "theme.Multi-sector bonds": "Πολυτομεακά ομόλογα",
      "theme.Balanced": "Ισορροπημένο",
      "theme.Blend": "Μικτό",
      "theme.Cash / money market": "Μετρητά / αγορά χρήματος",
      "track.eyebrow": "Προσωπική λίστα",
      "track.title": "Παρακολούθηση μετοχών, ETF και funds",
      "track.lede": "Προσθέστε σύμβολα που θέλετε να ακολουθείτε. Οι κάρτες ομαδοποιούνται ανά αγορά και ταξινομούνται A–Z.",
      "track.add": "Προσθήκη στη λίστα",
      "track.ticker": "Σύμβολο",
      "track.tickerHint": "π.χ. AAPL, VUAA.DE",
      "track.type": "Τύπος",
      "track.auto": "Αυτόματο",
      "track.stock": "Μετοχή",
      "track.etf": "ETF",
      "track.fund": "Αμοιβαίο κεφάλαιο",
      "track.addSymbol": "Προσθήκη συμβόλου",
      "track.loading": "Φόρτωση λίστας…",
      "track.dateAdded": "Ημ. προσθήκης",
      "track.livePrice": "Ζωντανή τιμή",
      "track.priceAtAdd": "Τιμή κατά την προσθήκη",
      "track.sinceAdded": "Από την προσθήκη",
      "track.1m": "1 μήνας",
      "track.6m": "6 μήνες",
      "track.1y": "1 έτος",
      "track.currency": "Νόμισμα",
      "track.priceSource": "Πηγή τιμής",
      "track.remove": "Αφαίρεση από τη λίστα",
      "track.removeConfirm": "Αφαίρεση αυτού του συμβόλου από τη λίστα;",
      "track.removeFailed": "Η αφαίρεση απέτυχε",
      "track.addFailed": "Αδυναμία προσθήκης συμβόλου",
      "track.viewDetails": "Λεπτομέρειες για {name}",
      "notifications.eyebrow": "Ειδοποιήσεις email",
      "notifications.title": "Ειδοποιήσεις",
      "notifications.lede": "Λάβετε μηνιαίο στιγμιότυπο των θέσεών σας στην Πρόοδο με email.",
      "notifications.monthly": "Μηνιαία αναφορά",
      "notifications.enable": "Ενεργοποίηση μηνιαίας αναφοράς",
      "notifications.enableHint": "Οι ίδιες θέσεις και σύνολα με τη σελίδα Πρόοδος, στο email σας.",
      "notifications.email": "Email παράδοσης",
      "notifications.emailHint": "Αφήστε κενό για να χρησιμοποιηθεί το email του λογαριασμού.",
      "notifications.schedule": "Αποστέλλεται την 1η κάθε μήνα τα μεσάνυχτα.",
      "notifications.save": "Αποθήκευση προτιμήσεων",
      "notifications.saving": "Αποθήκευση…",
      "notifications.loadError": "Δεν ήταν δυνατή η φόρτωση των ρυθμίσεων ειδοποιήσεων.",
      "notifications.saveError": "Δεν ήταν δυνατή η αποθήκευση των ρυθμίσεων ειδοποιήσεων.",
      "notifications.lastSent": "Τελευταία αναφορά για {month}.",
      "notifications.enabled": "Οι μηνιαίες αναφορές ενεργοποιήθηκαν. Θα λαμβάνετε email την 1η κάθε μήνα.",
      "notifications.disabled": "Οι μηνιαίες αναφορές απενεργοποιήθηκαν.",
      "notifications.emailOff": "Το email είναι απενεργοποιημένο προς το παρόν. Ευχαριστούμε",
      "login.title": "Σύνδεση",
      "login.lede": "Κάθε λογαριασμός έχει δικό του χαρτοφυλάκιο και πρόοδο.",
      "login.create": "Δημιουργία λογαριασμού",
      "login.email": "Email",
      "login.password": "Κωδικός",
      "login.forgot": "Ξεχάσατε τον κωδικό;",
      "login.rules": "Τουλάχιστον 10 χαρακτήρες, κεφαλαία και πεζά, 2 αριθμοί (όχι δίπλα) και 2 σύμβολα.",
      "login.signing": "Σύνδεση…",
      "login.creating": "Δημιουργία λογαριασμού…",
      "login.failed": "Η ταυτοποίηση απέτυχε",
      "forgot.title": "Ξεχάσατε τον κωδικό;",
      "forgot.lede": "Εισαγάγετε το email του λογαριασμού. Αν υπάρχει, θα σταλεί σύνδεσμος επαναφοράς.",
      "forgot.send": "Αποστολή συνδέσμου",
      "forgot.back": "Επιστροφή στη σύνδεση",
      "forgot.failed": "Αδυναμία αποστολής email επαναφοράς",
      "reset.title": "Επιλέξτε νέο κωδικό",
      "reset.lede": "Εισαγάγετε και επιβεβαιώστε τον νέο κωδικό. Το hash επαναφοράς από το email αποστέλλεται με το αίτημα.",
      "reset.new": "Νέος κωδικός",
      "reset.confirm": "Επιβεβαίωση κωδικού",
      "reset.submit": "Αλλαγή κωδικού",
      "reset.failed": "Αδυναμία επαναφοράς κωδικού",
      "nav.budget": "Προϋπολογισμός",
      "nav.pricing": "Τιμές",
      "nav.help": "Βοήθεια",
      "pricing.eyebrow": "Μηνιαίες επενδύσεις",
      "pricing.title": "Μείνετε στο μηνιαίο σχέδιό σας",
      "pricing.lede": "Ορίστε προϋπολογισμό και μετοχές, καταγράψτε αγορές στην Πρόοδο και δείτε τι ξοδέψατε, τι μένει στην άκρη και τα μερίσματα.",
      "pricing.disclaimer": "Δεν αποτελεί επενδυτική συμβουλή. Οι τιμές και οι ισοτιμίες μπορεί να καθυστερούν.",
      "pricing.bullet1": "Πλάνα προϋπολογισμού από μήνα σε μήνα",
      "pricing.bullet2": "Μηνιαίοι στόχοι ανά μετοχή και μήνες εντός στόχου",
      "pricing.bullet3": "Μετρητά στην άκρη και μερίσματα στο παράθυρο του πλάνου",
      "pricing.freeName": "Δωρεάν",
      "pricing.freePrice": "0 €",
      "pricing.forever": "για πάντα",
      "pricing.freeF1": "Υπολογιστής πλάνου (μία μετοχή)",
      "pricing.freeF2": "Πρόοδος: αγορές και πωλήσεις",
      "pricing.freeF3": "1 πλάνο προϋπολογισμού, έως 24 μήνες",
      "pricing.freeF4": "Ιδέες, Προτάσεις, Track (10 σύμβολα)",
      "pricing.freeF5": "Εξαγωγή JSON",
      "pricing.startFree": "Δωρεάν λογαριασμός",
      "pricing.proBadge": "Προτεινόμενο",
      "pricing.proName": "Pro",
      "pricing.proPrice": "1,99 €",
      "pricing.perMonth": "/ μήνα",
      "pricing.yearly": "ή 19,99 € / έτος όταν ενεργοποιηθεί η χρέωση · δοκιμή 14 ημερών",
      "pricing.proF1": "Απεριόριστα πλάνα προϋπολογισμού",
      "pricing.proF2": "Πλάνα έως 10 χρόνια",
      "pricing.proF3": "Μηνιαίο email αναφοράς",
      "pricing.proF4": "Track έως 50 σύμβολα",
      "pricing.proF5": "Πρόβλεψη και πλήρης ανάλυση",
      "pricing.upgrade": "Αναβάθμιση σε Pro",
      "pricing.signInUpgrade": "Σύνδεση για αναβάθμιση",
      "pricing.alreadyPro": "Έχετε Pro",
      "pricing.billingSoon": "Το Stripe δεν έχει ρυθμιστεί ακόμη σε αυτόν τον διακομιστή.",
      "pricing.checkoutFailed": "Αδυναμία έναρξης πληρωμής",
      "pricing.checkoutMonthly": "Μηνιαία συνδρομή ({provider})",
      "pricing.checkoutYearly": "Ετήσια συνδρομή — εξοικονόμηση με {provider}",
      "billing.upgradeHint": "Δείτε τις Τιμές για αναβάθμιση σε Pro.",
      "billing.proRequired": "Απαιτείται Pro για αυτή τη λειτουργία.",
      "billing.genericError": "Κάτι πήγε στραβά. Δοκιμάστε ξανά.",
      "billing.portalFailed": "Αδυναμία ανοίγματος πύλης χρέωσης.",
      "pricing.trustTitle": "Πώς υπολογίζουμε",
      "pricing.trustBody": "FIFO, ισοτιμίες ημέρας συναλλαγής και αντιστοίχιση προϋπολογισμού — με τεκμηρίωση.",
      "pricing.readHelp": "Οδηγός υπολογισμών",
      "help.eyebrow": "Διαφάνεια",
      "help.title": "Πώς υπολογίζουμε",
      "help.lede": "Τα νούμερα στην Προϋπολογισμό και την Πρόοδο προέρχονται από τις καταγεγραμμένες συναλλαγές σας. Δεν είναι φορολογική ή επενδυτική συμβουλή.",
      "help.budgetTitle": "Πλάνα προϋπολογισμού",
      "help.budgetP1": "Ένα πλάνο έχει μήνα έναρξης και λήξης, προαιρετικό μηνιαίο ποσό και προαιρετικούς μηνιαίους στόχους ανά μετοχή.",
      "help.budgetP2": "Οι αγορές στην Πρόοδο αντιστοιχίζονται σε μήνα κατά ημερομηνία αγοράς.",
      "help.budgetP3": "«Στην άκρη» είναι χρήματα προηγούμενων μηνών που δεν επενδύθηκαν.",
      "help.fxTitle": "Νομίσματα και ισοτιμίες",
      "help.fxP1": "Οι αγορές αποθηκεύουν το νόμισμα συναλλαγής. Τα σύνολα του πλάνου χρησιμοποιούν το νόμισμα του πλάνου.",
      "help.fxP2": "Τα μερίσματα χρησιμοποιούν ισοτιμία ημέρας πληρωμής. Το GBp θεωρείται GBP.",
      "help.fifoTitle": "Θέσεις FIFO στην Πρόοδο",
      "help.fifoP1": "Οι ανοιχτές θέσεις είναι FIFO.",
      "help.fifoP2": "Το «επενδυμένα» του πλάνου περιλαμβάνει αγορές εντός παραθύρου ακόμη κι αν πουλήσατε αργότερα.",
      "help.divTitle": "Μερίσματα",
      "help.divP1": "Μετρούν μερίσματα στο παράθυρο του πλάνου με τους κανόνες κατοχής και παρακράτησης φόρου.",
      "help.liveTitle": "Τρέχουσες τιμές",
      "help.liveP1": "Πηγές Yahoo Finance ή Stooq. Η ζωντανή αξία μπορεί να λείπει όταν αποτύχει η τιμή.",
      "help.disclaimer": "Το παρελθόν δεν εγγυάται το μέλλον.",
      "help.backPricing": "Τιμές",
      "welcome.eyebrow": "Καλώς ήρθατε",
      "welcome.title": "Τρία βήματα για τον πρώτο μήνα",
      "welcome.lede": "Επιλέξτε πώς θέλετε να ξεκινήσετε.",
      "welcome.stepBudget": "Δημιουργήστε μηνιαίο προϋπολογισμό (προτείνεται)",
      "welcome.stepBudgetBody": "Ορίστε μήνες, ποσό και μετοχές ανά μήνα.",
      "welcome.openBudget": "Άνοιγμα Προϋπολογισμού",
      "welcome.stepPlan": "Ή ξεκινήστε με ένα σύμβολο",
      "welcome.stepPlanBody": "Υπολογιστής πλάνου για ένα ticker.",
      "welcome.openPlan": "Άνοιγμα Σχεδίου",
      "welcome.stepProgress": "Καταγράψτε αγορά",
      "welcome.stepProgressBody": "Η Πρόοδος μετράει τις πραγματικές αγορές.",
      "welcome.openProgress": "Άνοιγμα Προόδου",
      "welcome.done": "Μετάβαση στην Αρχική",
      "welcome.help": "Πώς υπολογίζουμε",
      "footer.tagline": "Πειθαρχία μηνιαίας επένδυσης",
      "footer.pricing": "Τιμές",
      "footer.help": "Πώς υπολογίζουμε",
      "footer.terms": "Όροι",
      "footer.privacy": "Απόρρητο",
      "footer.plan": "Υπολογιστής πλάνου",
      "legal.termsTitle": "Όροι χρήσης",
      "legal.privacyTitle": "Πολιτική απορρήτου",
      "legal.draft": "Προσχέδιο — νομική αναθεώρηση πριν το live.",
      "legal.termsBody": "Το Stock Buy Planner προσφέρει εργαλεία σχεδιασμού και παρακολούθησης μόνο. Δεν παρέχει επενδυτική, φορολογική ή νομική συμβουλή.",
      "legal.privacyBody": "Αποθηκεύουμε email (κρυπτογραφημένο), δεδομένα χαρτοφυλακίου και προτιμήσεις. Εξαγωγή ή διαγραφή από τον Λογαριασμό.",
      "account.planTitle": "Το πακέτό σας",
      "account.upgrade": "Αναβάθμιση σε Pro",
      "account.manageBilling": "Διαχείριση χρέωσης",
      "account.helpTitle": "Βοήθεια και δεδομένα",
      "account.helpBody": "Υπολογισμοί, τιμές και εξαγωγή.",
      "account.helpCalc": "Πώς υπολογίζουμε",
      "account.tierFree": "Δωρεάν — ένα πλάνο προϋπολογισμού",
      "account.tierPro": "Pro — απεριόριστα πλάνα και email",
      "account.tierUnknown": "Αδυναμία φόρτωσης κατάστασης",
      "budget.eyebrow": "Μηνιαίος προϋπολογισμός",
      "budget.title": "Επενδύστε σταθερό ποσό κάθε μήνα",
      "budget.lede": "Ορίστε μήνα έναρξης και λήξης, το ποσό που διαθέτετε κάθε μήνα και τις μετοχές που σκοπεύετε να αγοράσετε. Οι αγορές σας από την Πρόοδο αντιστοιχίζονται αυτόματα.",
      "budget.loading": "Φόρτωση προϋπολογισμού…",
      "budget.loadingLive": "Φόρτωση αγορών, μερισμάτων και τρεχουσών τιμών…",
      "budget.updatedAt": "Ενημέρωση {time}",
      "budget.disclaimer": "Οι αγορές, τα μερίσματα και η τρέχουσα αξία προέρχονται από τις θέσεις σας στην Πρόοδο. Ποσά σε άλλα νομίσματα μετατρέπονται με την ισοτιμία της ημέρας συναλλαγής ή πληρωμής. Δεν αποτελεί επενδυτική συμβουλή.",
      "budget.yourPlans": "Τα πλάνα σας",
      "budget.newPlan": "Νέο πλάνο",
      "budget.noPlans": "Δεν υπάρχουν πλάνα ακόμη. Δημιουργήστε το πρώτο παρακάτω.",
      "budget.chipThisMonth": "Αυτόν τον μήνα: {spent} από {budget}",
      "budget.chipTotal": "Επενδύθηκαν {spent}",
      "budget.perMonthShort": "μήνα",
      "budget.perMonth": "{amount} τον μήνα",
      "budget.phase.upcoming": "Επερχόμενο",
      "budget.phase.active": "Ενεργό",
      "budget.phase.ended": "Ολοκληρώθηκε",
      "budget.state.done": "Ολοκληρώθηκε",
      "budget.state.partial": "Μερικώς",
      "budget.state.missed": "Χάθηκε",
      "budget.state.pending": "Εκκρεμεί",
      "budget.formNew": "Νέο πλάνο",
      "budget.formEdit": "Επεξεργασία πλάνου",
      "budget.name": "Όνομα πλάνου (προαιρετικό)",
      "budget.start": "Μήνας έναρξης",
      "budget.end": "Μήνας λήξης",
      "budget.monthsOne": "{n} μήνας",
      "budget.monthsN": "{n} μήνες",
      "budget.windowInvalid": "Ο μήνας λήξης πρέπει να είναι ίδιος ή μετά τον μήνα έναρξης, έως 10 χρόνια αργότερα.",
      "budget.monthFormat": "Χρησιμοποιήστε τη μορφή ΕΕΕΕ-ΜΜ.",
      "budget.amount": "Μηνιαίο ποσό",
      "budget.amountHint": "Προαιρετικό. Αφήστε το κενό για να χρησιμοποιηθεί το σύνολο των μετοχών παρακάτω.",
      "budget.currency": "Νόμισμα",
      "budget.items": "Μετοχές για αγορά κάθε μήνα",
      "budget.addItem": "Προσθήκη μετοχής",
      "budget.ticker": "Σύμβολο",
      "budget.itemAmount": "Ανά μήνα ({c})",
      "budget.removeItem": "Αφαίρεση μετοχής",
      "budget.includeUnplanned": "Να μετρούν και αγορές άλλων μετοχών στον προϋπολογισμό",
      "budget.allocEmpty": "Προσθέστε μηνιαίο ποσό ή τουλάχιστον μία μετοχή για να δείτε την κατανομή.",
      "budget.allocPlanned": "Μετοχές {planned} από {budget} τον μήνα",
      "budget.allocAuto": "Δεν ορίστηκε μηνιαίο ποσό, οπότε ο προϋπολογισμός είναι το σύνολο των μετοχών.",
      "budget.allocOver": "Οι μετοχές ξεπερνούν το μηνιαίο ποσό κατά {amount}.",
      "budget.allocFree": "{amount} τον μήνα μένουν στην άκρη ως μετρητά.",
      "budget.allocExact": "Όλο το μηνιαίο ποσό έχει κατανεμηθεί σε μετοχές.",
      "budget.allocTotal": "{total} συνολικά σε {n} μήνες.",
      "budget.cancel": "Ακύρωση",
      "budget.save": "Αποθήκευση πλάνου",
      "budget.update": "Αποθήκευση αλλαγών",
      "budget.saving": "Αποθήκευση…",
      "budget.created": "Το πλάνο δημιουργήθηκε.",
      "budget.updated": "Το πλάνο αποθηκεύτηκε.",
      "budget.delete": "Διαγραφή πλάνου",
      "budget.deleteConfirm": "Διαγραφή του «{name}»; Οι αγορές και τα μερίσματά σας παραμένουν στην Πρόοδο.",
      "budget.deleted": "Το πλάνο διαγράφηκε.",
      "budget.errMonths": "Επιλέξτε μήνα έναρξης και λήξης.",
      "budget.errOrder": "Ο μήνας λήξης πρέπει να είναι ίδιος ή μετά τον μήνα έναρξης.",
      "budget.errLong": "Ένα πλάνο μπορεί να καλύπτει έως {n} μήνες.",
      "budget.errAmount": "Εισαγάγετε έγκυρο μηνιαίο ποσό ή αφήστε το κενό.",
      "budget.errTicker": "Συμπληρώστε σύμβολο σε κάθε γραμμή μετοχής ή αφαιρέστε την κενή γραμμή.",
      "budget.errItemAmount": "Εισαγάγετε μηνιαίο ποσό μεγαλύτερο του μηδενός για το {symbol}.",
      "budget.errDuplicate": "Το {symbol} εμφανίζεται περισσότερες από μία φορές.",
      "budget.errEmpty": "Προσθέστε μηνιαίο ποσό ή τουλάχιστον μία μετοχή.",
      "budget.errTooMany": "Ένα πλάνο μπορεί να έχει έως {n} μετοχές.",
      "budget.countsAll": "Μετρούν όλες οι αγορές",
      "budget.countsPlanned": "Μετρούν μόνο οι μετοχές του πλάνου",
      "budget.edit": "Επεξεργασία",
      "budget.overall": "Συνολική πρόοδος",
      "budget.investedOfTotal": "Επενδυμένα από το συνολικό πλάνο",
      "budget.timeElapsed": "Χρόνος που πέρασε",
      "budget.monthsOf": "{n} από {total} μήνες",
      "budget.paceOn": "Εντός ρυθμού",
      "budget.paceBehind": "Πίσω από τον ρυθμό",
      "budget.paceAhead": "Μπροστά από τον ρυθμό",
      "budget.kpiInvested": "Επενδυμένα έως τώρα",
      "budget.kpiInvestedSub": "{pct} από {budget} του προϋπολογισμού έως σήμερα",
      "budget.tipInvested": "Χρήματα που δαπανήθηκαν σε αγορές εντός του πλάνου, μαζί με μετοχές που πουλήσατε αργότερα.",
      "budget.kpiSetAside": "Στην άκρη",
      "budget.setAsideSub": "+{amount} διαθέσιμα ακόμη αυτόν τον μήνα",
      "budget.tipSetAside": "Προϋπολογισμός ολοκληρωμένων μηνών που δεν επενδύθηκε. Αρνητικό ποσό σημαίνει ότι επενδύσατε περισσότερα από το πλάνο.",
      "budget.kpiDividends": "Μερίσματα που λάβατε",
      "budget.dividendsSub": "Μετά από {amount} παρακράτηση φόρου",
      "budget.tipDividends": "Καθαρά μερίσματα που πληρώθηκαν κατά το πλάνο για μετοχές του πλάνου, μετά τη ρύθμιση παρακράτησης φόρου.",
      "budget.kpiValue": "Αγοραία αξία",
      "budget.kpiValueSub": "Κόστος {cost}",
      "budget.tipValue": "Τρέχουσα αξία των μετοχών του πλάνου που κατέχετε ακόμη.",
      "budget.kpiGrowth": "Ανάπτυξη",
      "budget.kpiReturn": "Συνολική απόδοση",
      "budget.tipReturn": "Άνοδος τιμής, συν κέρδη από πωλήσεις, συν μερίσματα που λάβατε.",
      "budget.kpiCash": "Διαθέσιμα μετρητά",
      "budget.tipCash": "Χρήματα που δεν επενδύθηκαν έως τώρα (μαζί με όσα μένουν αυτόν τον μήνα), συν μερίσματα και έσοδα πωλήσεων.",
      "budget.kpiOnTrack": "Μήνες εντός στόχου",
      "budget.kpiOnTrackSub": "Ολοκληρωμένοι μήνες που πέτυχαν όλους τους στόχους",
      "budget.kpiOnTrackNone": "Δεν υπάρχουν ακόμη ολοκληρωμένοι μήνες",
      "budget.tipOnTrack": "Ένας μήνας είναι εντός στόχου όταν κάθε μετοχή του πλάνου έφτασε το μηνιαίο ποσό της ή, σε πλάνα χωρίς μετοχές, επενδύθηκε όλος ο προϋπολογισμός.",
      "budget.streak": "{n} μήνες στη σειρά",
      "budget.startsTitle": "Ξεκινά τον {month}",
      "budget.startsIn": "Το πλάνο σας ξεκινά σε {n} μήνες. Οι μηνιαίοι στόχοι θα εμφανιστούν εδώ όταν ξεκινήσει.",
      "budget.startsInOne": "Το πλάνο σας ξεκινά τον επόμενο μήνα. Οι μηνιαίοι στόχοι θα εμφανιστούν εδώ όταν ξεκινήσει.",
      "budget.endedTitle": "Το πλάνο ολοκληρώθηκε τον {month}",
      "budget.endedLede": "Επενδύσατε {spent} από προϋπολογισμό {budget}.",
      "budget.thisMonth": "Αυτός ο μήνας · {month}",
      "budget.dayLeft": "Απομένει {n} ημέρα",
      "budget.daysLeft": "Απομένουν {n} ημέρες",
      "budget.monthLeft": "Απομένουν {amount}",
      "budget.monthOver": "{amount} πάνω από τον προϋπολογισμό",
      "budget.estShares": "≈ {shares} μετοχές στα {price}",
      "budget.toGo": "Απομένουν {amount}",
      "budget.lineDone": "Ο στόχος επιτεύχθηκε",
      "budget.logBuy": "Καταγραφή αγοράς",
      "budget.unplannedThisMonth": "Περιλαμβάνει {amount} από αγορές εκτός πλάνου.",
      "budget.noBuysYet": "Δεν υπάρχουν ακόμη αγορές σε αυτό το πλάνο. Καταγράψτε αγορές στην Πρόοδο και θα μετρήσουν αυτόματα.",
      "budget.openProgress": "Άνοιγμα Προόδου",
      "budget.chartTitle": "Επενδύσεις ανά μήνα",
      "budget.legendOn": "Εντός στόχου",
      "budget.legendUnder": "Κάτω από τον προϋπολογισμό",
      "budget.legendOver": "Πάνω από τον προϋπολογισμό",
      "budget.legendBudget": "Μηνιαίος προϋπολογισμός",
      "budget.stocksTitle": "Μετοχές του πλάνου",
      "budget.unplanned": "Εκτός πλάνου",
      "budget.ofTarget": "από {amount}",
      "budget.boughtShares": "{n} αγοράστηκαν",
      "budget.colMonthly": "Ανά μήνα",
      "budget.colInvested": "Επενδυμένα",
      "budget.colAvgCost": "Μέσο κόστος",
      "budget.colValue": "Αξία",
      "budget.colGrowth": "Ανάπτυξη",
      "budget.colDividends": "Μερίσματα",
      "budget.monthsTitle": "Μήνα προς μήνα",
      "budget.monthsHint": "Προϋπολογισμός, αγορές και μερίσματα για κάθε μήνα",
      "budget.now": "Τώρα",
      "budget.colMonth": "Μήνας",
      "budget.colBudget": "Προϋπολογισμός",
      "budget.colLeft": "Υπόλοιπο",
      "budget.tipLeft": "Προϋπολογισμός μείον το ποσό που επενδύθηκε τον μήνα.",
      "budget.colSetAside": "Στην άκρη",
      "budget.colStocks": "Μετοχές",
      "budget.projTitle": "Αν συνεχίσετε έως τον {month}",
      "budget.projInvested": "Συνολική επένδυση",
      "budget.projValue": "Εκτιμώμενη αξία",
      "budget.projGain": "Εκτιμώμενη ανάπτυξη",
      "budget.projDividends": "Ετήσια μερίσματα",
      "budget.projCash": "Μετρητά στην άκρη",
      "budget.projDisclaimer": "Εκτίμηση με βάση τα ποσά του πλάνου, τη μέση μηνιαία μεταβολή κάθε μετοχής στο παρελθόν και την τρέχουσα μερισματική απόδοση. Οι αγορές μπορεί να πέσουν· δεν είναι πρόβλεψη.",
      "budget.warnFx": "Έλειπαν ιστορικές ισοτιμίες {list} → {c} για ορισμένες ημερομηνίες, οπότε χρησιμοποιήθηκε η σημερινή.",
      "budget.warnQuotes": "Δεν υπάρχουν τρέχουσες τιμές για {list}· η αξία τους δεν περιλαμβάνεται.",
      "budget.warnExcluded": "{n} αγορές ({amount}) μετοχών εκτός πλάνου δεν υπολογίζονται.",
      "budget.warnExcludedOne": "1 αγορά ({amount}) μετοχής εκτός πλάνου δεν υπολογίζεται.",
      "budget.introTitle": "Οργανώστε τις μηνιαίες επενδύσεις σας",
      "budget.step1": "Επιλέξτε την περίοδο",
      "budget.step1Body": "Ορίστε μήνα έναρξης και λήξης και, αν θέλετε, πόσα μπορείτε να επενδύετε κάθε μήνα.",
      "budget.step2": "Προσθέστε τις μετοχές",
      "budget.step2Body": "Καταγράψτε τις μετοχές που σκοπεύετε να αγοράζετε κάθε μήνα και το ποσό για καθεμία. Ό,τι δεν κατανέμεται καταγράφεται ως μετρητά στην άκρη.",
      "budget.step3": "Παρακολουθήστε το ζωντανά",
      "budget.step3Body": "Καταγράφετε αγορές στην Πρόοδο όπως πάντα. Εδώ βλέπετε τι ξοδέψατε, τι μένει στην άκρη, τα μερίσματα και πώς αναπτύσσεται το πλάνο.",
      "budget.upgradeHint": "Δείτε τις Τιμές για αναβάθμιση σε Pro.",
    },
  };

  const FLAG_EN = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="60" height="60" fill="#012169"/><path d="M0 0 L60 60 M60 0 L0 60" stroke="#fff" stroke-width="12"/><path d="M0 0 L60 60 M60 0 L0 60" stroke="#C8102E" stroke-width="8"/><path d="M30 0 V60 M0 30 H60" stroke="#fff" stroke-width="16"/><path d="M30 0 V60 M0 30 H60" stroke="#C8102E" stroke-width="10"/></svg>`;
  const FLAG_EL = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="60" height="60" fill="#0D5EAF"/><rect y="6.67" width="60" height="6.67" fill="#fff"/><rect y="20" width="60" height="6.67" fill="#fff"/><rect y="33.33" width="60" height="6.67" fill="#fff"/><rect y="46.67" width="60" height="6.67" fill="#fff"/><rect width="26.67" height="26.67" fill="#0D5EAF"/><rect x="10" width="6.67" height="26.67" fill="#fff"/><rect y="10" width="26.67" height="6.67" fill="#fff"/></svg>`;

  function readLang() {
    try {
      return localStorage.getItem(LANG_KEY) === "el" ? "el" : "en";
    } catch {
      return "en";
    }
  }

  function readTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      /* ignore */
    }
    return "dark";
  }

  function t(key, vars) {
    const lang = readLang();
    let value = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key];
    if (value == null) value = typeof vars === "string" ? vars : key;
    if (vars && typeof vars === "object") {
      value = value.replace(/\{(\w+)\}/g, (_, name) =>
        vars[name] == null ? "" : String(vars[name])
      );
    }
    return value;
  }

  function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-label", t("theme.toggle"));
      btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${next === "light" ? "dark_mode" : "light_mode"}</span>`;
    }
  }

  function applyLang(lang, { persist = true } = {}) {
    const next = lang === "el" ? "el" : "en";
    document.documentElement.lang = next;
    if (persist) {
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {
        /* ignore */
      }
    }
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    const flagBtn = document.getElementById("lang-toggle");
    if (flagBtn) {
      flagBtn.innerHTML = next === "el" ? FLAG_EL : FLAG_EN;
      flagBtn.setAttribute("aria-label", t("lang.choose"));
    }
    global.dispatchEvent(new CustomEvent("sbp:lang-change", { detail: { lang: next } }));
  }

  function enhancePasswordFields(root = document) {
    root.querySelectorAll('input[type="password"]').forEach((input) => {
      const field = input.closest(".md-field");
      if (!field || field.querySelector(".md-password-toggle")) return;
      field.classList.add("has-password-toggle");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "md-password-toggle";
      btn.setAttribute("aria-label", t("login.showPassword"));
      btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">visibility</span>`;
      btn.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-label", show ? t("login.hidePassword") : t("login.showPassword"));
        btn.querySelector(".material-symbols-outlined").textContent = show
          ? "visibility_off"
          : "visibility";
      });
      field.appendChild(btn);
    });
  }

  function closeChromeMenus() {
    const langMenu = document.getElementById("lang-menu");
    const langBtn = document.getElementById("lang-toggle");
    const accountMenu = document.getElementById("account-menu");
    const accountBtn = document.getElementById("account-toggle");
    if (langMenu) langMenu.hidden = true;
    langBtn?.setAttribute("aria-expanded", "false");
    if (accountMenu) accountMenu.hidden = true;
    accountBtn?.setAttribute("aria-expanded", "false");
  }

  let exportEnabled = false;
  let deleteEnabled = true;
  let accountFlagsLoaded = false;

  function fetchAppConfig(options) {
    if (global.SbpAppConfig?.fetch) return global.SbpAppConfig.fetch(options);
    return fetch("/api/config", { credentials: "include" }).then((response) =>
      response.json().catch(() => ({}))
    );
  }

  function applyAccountFlags() {
    const exportSections = document.querySelectorAll("[data-export-only]");
    const deleteSections = document.querySelectorAll("[data-delete-only]");
    const exportButtons = document.querySelectorAll("[data-account-export]");
    const deleteButtons = document.querySelectorAll("[data-account-delete]");

    if (!accountFlagsLoaded) {
      exportSections.forEach((el) => {
        el.hidden = true;
      });
      deleteSections.forEach((el) => {
        el.hidden = true;
      });
      exportButtons.forEach((btn) => {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
      });
      deleteButtons.forEach((btn) => {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
      });
      return;
    }

    exportSections.forEach((el) => {
      el.hidden = !exportEnabled;
    });
    deleteSections.forEach((el) => {
      el.hidden = !deleteEnabled;
    });
    exportButtons.forEach((btn) => {
      btn.disabled = !exportEnabled;
      btn.setAttribute("aria-disabled", exportEnabled ? "false" : "true");
    });
    deleteButtons.forEach((btn) => {
      btn.disabled = !deleteEnabled;
      btn.setAttribute("aria-disabled", deleteEnabled ? "false" : "true");
    });
    const exportBtn = document.getElementById("account-export");
    if (exportBtn) exportBtn.hidden = !exportEnabled;
    const deleteBtn = document.getElementById("account-delete");
    if (deleteBtn) deleteBtn.hidden = !deleteEnabled;
    document.getElementById("account-toggle")?.classList.toggle(
      "is-active",
      global.location.pathname === "/account"
    );
  }

  async function loadAccountFlags() {
    try {
      const data = await fetchAppConfig();
      exportEnabled = parseConfigFlag(data.export_enabled, false);
      deleteEnabled = parseConfigFlag(data.delete_enabled, true);
    } catch {
      exportEnabled = false;
      deleteEnabled = true;
    } finally {
      accountFlagsLoaded = true;
    }
    applyAccountFlags();
  }

  function syncAccountChrome(event) {
    const chrome = document.querySelector(".app-chrome");
    const wrap = document.getElementById("account-wrap");
    const emailEl = document.getElementById("account-email");
    if (!chrome || !wrap) return;
    const authed = Boolean(
      event?.detail?.authenticated ?? global.SbpAuth?.isAuthenticated?.()
    );
    chrome.classList.toggle("is-signed-in", authed);
    wrap.hidden = false;
    wrap.style.display = authed ? "" : "none";
    if (emailEl) {
      emailEl.textContent =
        event?.detail?.email || global.SbpAuth?.currentEmail?.() || "";
    }
    applyAccountFlags();
  }

  function closeChangePasswordDialog() {
    const dialog = document.getElementById("change-password-dialog");
    if (!dialog) return;
    dialog.hidden = true;
    document.body.classList.remove("progress-modal-open");
  }

  function openChangePasswordDialog() {
    const dialog = document.getElementById("change-password-dialog");
    if (!dialog) return;
    dialog.querySelectorAll("input").forEach((input) => {
      input.type = "password";
      input.value = "";
    });
    const err = document.getElementById("change-password-error");
    const ok = document.getElementById("change-password-ok");
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    if (ok) ok.hidden = true;
    dialog.hidden = false;
    document.body.classList.add("progress-modal-open");
    enhancePasswordFields(dialog);
    dialog.querySelector("input")?.focus();
  }

  async function submitChangePassword(event) {
    event.preventDefault();
    const current = document.getElementById("account-current");
    const next = document.getElementById("account-new");
    const confirm = document.getElementById("account-confirm");
    const err = document.getElementById("change-password-error");
    const ok = document.getElementById("change-password-ok");
    const submit = document.getElementById("change-password-submit");
    const showErr = (message) => {
      if (ok) ok.hidden = true;
      if (err) {
        err.textContent = message;
        err.hidden = false;
      }
    };
    if (next.value !== confirm.value) {
      showErr(t("account.mismatch"));
      return;
    }
    submit.disabled = true;
    submit.textContent = t("account.saving");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_password: current.value,
          new_password: next.value,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg || item).join(", ")
          : data.detail;
        throw new Error(detail || t("account.failed"));
      }
      current.value = "";
      next.value = "";
      confirm.value = "";
      if (err) err.hidden = true;
      if (ok) {
        ok.textContent = t("account.ok");
        ok.hidden = false;
      }
    } catch (exc) {
      showErr(exc.message || t("account.failed"));
    } finally {
      submit.disabled = false;
      submit.textContent = t("account.save");
    }
  }

  async function exportAccount(format = "csv") {
    if (!exportEnabled) {
      window.alert(t("account.exportFailed"));
      return;
    }
    try {
      const response = await fetch(`/api/account/export?format=${encodeURIComponent(format)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(t("account.exportFailed"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        format === "json" ? "stock-buy-planner-export.json" : "stock-buy-planner-export.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exc) {
      window.alert(exc.message || t("account.exportFailed"));
    }
  }

  function closeDeleteAccountDialog() {
    const dialog = document.getElementById("delete-account-dialog");
    if (!dialog) return;
    dialog.hidden = true;
    document.body.classList.remove("progress-modal-open");
  }

  function openDeleteAccountDialog() {
    if (!deleteEnabled) return;
    const dialog = document.getElementById("delete-account-dialog");
    if (!dialog) return;
    const input = document.getElementById("delete-account-password");
    const err = document.getElementById("delete-account-error");
    if (input) {
      input.type = "password";
      input.value = "";
    }
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    dialog.hidden = false;
    document.body.classList.add("progress-modal-open");
    enhancePasswordFields(dialog);
    input?.focus();
  }

  async function submitDeleteAccount(event) {
    event.preventDefault();
    const password = document.getElementById("delete-account-password");
    const err = document.getElementById("delete-account-error");
    const submit = document.getElementById("delete-account-submit");
    submit.disabled = true;
    submit.textContent = t("account.deleting");
    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: password.value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg || item).join(", ")
          : data.detail;
        throw new Error(detail || t("account.failed"));
      }
      global.SbpAuth?.clearClientCaches?.();
      global.location.href = "/login";
    } catch (exc) {
      if (err) {
        err.textContent = exc.message || t("account.failed");
        err.hidden = false;
      }
      submit.disabled = false;
      submit.textContent = t("account.deleteConfirm");
    }
  }

  function renderChrome() {
    if (document.querySelector(".app-chrome")) return;
    const lang = readLang();
    const theme = readTheme();
    const wrap = document.createElement("div");
    wrap.className = "app-chrome";
    wrap.innerHTML = `
      <div class="lang-wrap" id="account-wrap" style="display:none">
        <button type="button" class="chrome-btn chrome-account-btn" id="account-toggle" aria-haspopup="menu" aria-expanded="false" aria-label="${t("account.menu")}">
          <span class="material-symbols-outlined" aria-hidden="true">person</span>
          <span class="chrome-account-label">${t("account.menu")}</span>
        </button>
        <div class="lang-menu account-menu" id="account-menu" hidden role="menu">
          <p class="account-email" id="account-email"></p>
          <a class="lang-option" id="account-open" role="menuitem" href="/account">${t("account.open")}</a>
          <button type="button" class="lang-option" id="account-signout" role="menuitem">
            <span class="material-symbols-outlined" aria-hidden="true">logout</span>
            ${t("nav.signout")}
          </button>
        </div>
      </div>
      <button type="button" class="chrome-btn" id="theme-toggle" aria-label="${t("theme.toggle")}"></button>
      <div class="lang-wrap">
        <button type="button" class="chrome-btn lang-btn" id="lang-toggle" aria-haspopup="listbox" aria-expanded="false" aria-label="${t("lang.choose")}"></button>
        <div class="lang-menu" id="lang-menu" hidden role="listbox">
          <button type="button" class="lang-option" data-lang="en" role="option">
            <span class="lang-flag">${FLAG_EN}</span>
            <span>${t("lang.en")}</span>
          </button>
          <button type="button" class="lang-option" data-lang="el" role="option">
            <span class="lang-flag">${FLAG_EL}</span>
            <span>${t("lang.el")}</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const dialog = document.createElement("div");
    dialog.id = "change-password-dialog";
    dialog.className = "progress-modal";
    dialog.hidden = true;
    dialog.innerHTML = `
      <div class="progress-modal-backdrop" data-change-password-close></div>
      <div class="progress-modal-dialog account-password-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <button type="button" class="progress-modal-close" data-change-password-close aria-label="${t("common.close")}">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
        <h2 id="change-password-title">${t("account.change")}</h2>
        <form id="change-password-form">
          <label class="md-field">
            <input id="account-current" name="current_password" type="password" autocomplete="current-password" placeholder=" " required />
            <span class="md-field-label">${t("account.current")}</span>
          </label>
          <label class="md-field">
            <input id="account-new" name="new_password" type="password" autocomplete="new-password" placeholder=" " required />
            <span class="md-field-label">${t("account.new")}</span>
          </label>
          <label class="md-field">
            <input id="account-confirm" name="new_password_confirm" type="password" autocomplete="new-password" placeholder=" " required />
            <span class="md-field-label">${t("account.confirm")}</span>
          </label>
          <p class="hint auth-password-rules">${t("login.rules")}</p>
          <p class="ok" id="change-password-ok" hidden></p>
          <p class="error" id="change-password-error" hidden></p>
          <button type="submit" id="change-password-submit">${t("account.save")}</button>
        </form>
      </div>
    `;
    document.body.appendChild(dialog);

    const deleteDialog = document.createElement("div");
    deleteDialog.id = "delete-account-dialog";
    deleteDialog.className = "progress-modal";
    deleteDialog.hidden = true;
    deleteDialog.innerHTML = `
      <div class="progress-modal-backdrop" data-delete-account-close></div>
      <div class="progress-modal-dialog account-password-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
        <button type="button" class="progress-modal-close" data-delete-account-close aria-label="${t("common.close")}">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
        <h2 id="delete-account-title">${t("account.delete")}</h2>
        <p class="lede">${t("account.deleteHint")}</p>
        <form id="delete-account-form">
          <label class="md-field">
            <input id="delete-account-password" name="password" type="password" autocomplete="current-password" placeholder=" " required />
            <span class="md-field-label">${t("account.current")}</span>
          </label>
          <p class="error" id="delete-account-error" hidden></p>
          <button type="submit" id="delete-account-submit" class="btn-danger">${t("account.deleteConfirm")}</button>
        </form>
      </div>
    `;
    document.body.appendChild(deleteDialog);

    applyTheme(theme);
    const flagBtn = document.getElementById("lang-toggle");
    const menu = document.getElementById("lang-menu");
    const accountBtn = document.getElementById("account-toggle");
    const accountMenu = document.getElementById("account-menu");
    flagBtn.innerHTML = lang === "el" ? FLAG_EL : FLAG_EN;

    document.getElementById("theme-toggle").addEventListener("click", () => {
      applyTheme(readTheme() === "light" ? "dark" : "light");
    });

    flagBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      closeChromeMenus();
      menu.hidden = !open;
      flagBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-lang]");
      if (!option) return;
      const next = option.getAttribute("data-lang") === "el" ? "el" : "en";
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {
        /* ignore */
      }
      location.reload();
    });

    accountBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = accountMenu.hidden;
      closeChromeMenus();
      accountMenu.hidden = !open;
      accountBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.getElementById("account-signout").addEventListener("click", () => {
      global.SbpAuth?.logout?.();
    });
    document.getElementById("change-password-form").addEventListener("submit", submitChangePassword);
    document.getElementById("delete-account-form").addEventListener("submit", submitDeleteAccount);
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-change-password-close]")) closeChangePasswordDialog();
    });
    deleteDialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-delete-account-close]")) closeDeleteAccountDialog();
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest?.(".app-chrome")) return;
      closeChromeMenus();
    });
    document.addEventListener("sbp:auth-ready", syncAccountChrome);
    global.SbpAuth?.whenAuthReady?.(syncAccountChrome);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeChangePasswordDialog();
        closeDeleteAccountDialog();
      }
    });
  }

  document.documentElement.dataset.theme = readTheme();
  document.documentElement.lang = readLang();

  function hideHelpTip() {
    document.getElementById("help-tip-float")?.remove();
  }

  function showHelpTip(anchor) {
    hideHelpTip();
    const text = anchor.getAttribute("data-help-tip") || anchor.getAttribute("data-why-tip");
    if (!text) return;
    const bubble = document.createElement("div");
    bubble.id = "help-tip-float";
    bubble.className = "help-tip-bubble is-open";
    bubble.setAttribute("role", "tooltip");
    bubble.textContent = text;
    document.body.appendChild(bubble);
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 24);
    bubble.style.width = `${width}px`;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    let top = rect.bottom + 8;
    if (top + bubble.offsetHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - bubble.offsetHeight - 8);
    }
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function bindHelpTips() {
    const selector = "[data-help-tip], [data-why-tip]";
    document.addEventListener("mouseover", (event) => {
      const tip = event.target.closest?.(selector);
      if (tip) showHelpTip(tip);
    });
    document.addEventListener("mouseout", (event) => {
      const tip = event.target.closest?.(selector);
      if (!tip) return;
      if (event.relatedTarget && tip.contains(event.relatedTarget)) return;
      hideHelpTip();
    });
    document.addEventListener("focusin", (event) => {
      const tip = event.target.closest?.(selector);
      if (tip) showHelpTip(tip);
    });
    document.addEventListener("focusout", hideHelpTip);
    document.addEventListener("scroll", hideHelpTip, true);
  }

  function helpIcon(text) {
    const safe = String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    return `<span class="help-tip" tabindex="0" data-help-tip="${safe}"><span class="material-symbols-outlined" aria-hidden="true">info</span></span>`;
  }

  function translateTheme(name) {
    if (!name) return "";
    const key = `theme.${name}`;
    const value = t(key);
    return value === key ? name : value;
  }

  function mountSiteFooter() {
    const page = document.querySelector(".page");
    if (!page || !document.body.classList.contains("has-site-footer")) return;
    if (page.querySelector(".site-footer")) return;
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `
      <p class="site-footer-tagline">${t("footer.tagline")}</p>
      <nav class="site-footer-links" aria-label="Site">
        <a href="/pricing">${t("footer.pricing")}</a>
        <a href="/help/calculations">${t("footer.help")}</a>
        <a href="/plan">${t("footer.plan")}</a>
        <a href="/legal/terms">${t("footer.terms")}</a>
        <a href="/legal/privacy">${t("footer.privacy")}</a>
      </nav>`;
    page.appendChild(footer);
  }

  function boot() {
    renderChrome();
    applyLang(readLang(), { persist: false });
    mountSiteFooter();
    bindHelpTips();
    enhancePasswordFields();
    global.SbpAuth?.whenAuthReady?.(syncAccountChrome);
    syncAccountChrome();
    applyAccountFlags();
    loadAccountFlags();
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-account-change]")) {
        openChangePasswordDialog();
        return;
      }
      if (event.target.closest("[data-account-delete]")) {
        if (!deleteEnabled) return;
        openDeleteAccountDialog();
        return;
      }
      if (event.target.closest("[data-account-signout]")) {
        global.SbpAuth?.logout?.();
        return;
      }
      const exportBtn = event.target.closest("[data-account-export]");
      if (exportBtn) {
        if (!exportEnabled) return;
        exportAccount(exportBtn.getAttribute("data-account-export") || "csv");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.SbpI18n = {
    t,
    lang: readLang,
    helpIcon,
    translateTheme,
    enhancePasswordFields,
    syncAccountChrome,
    loadAccountFlags,
    applyAccountFlags,
    parseConfigFlag,
    fetchAppConfig,
    exportAccount,
    FLAG_PX,
  };
})(window);
