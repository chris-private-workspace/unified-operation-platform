---
phase: W10-auth-fe-sso
status: active
---

# W10（AUTH-2）— Progress（daily + retro）

## Day 0 — 2026-07-10（kickoff / plan draft）

**做咗**:
- 路線:清完 tech-debt batch（commit `399283f`)後,Chris 揀推 **AUTH 線**。確認 IT SPA app registration 現況 = **未開始 / 仲傾緊** → 第一步 = **plan-first + IT checklist**（唔即 code 空殼）。
- Research:
  - microsoft-docs 核實 MSAL React 整合（`MsalProvider` + `PublicClientApplication` singleton + `acquireTokenSilent` attach Bearer;api.ts 呢種 non-component 用 module-level msal instance 攞 token,唔喺 provider context 外 call interactive）+ Entra SPA app registration 規格（SPA platform + PKCE、Expose an API scope、audience 對齊）。
  - Explore agent 掃 `apps/web` 整合觸點（見 plan §1.1）：api.ts L18/33/57（3 module-level fetch,零 token）· App.tsx L18-22（QueryClientProvider>RouterProvider,無 auth provider）· router.tsx（無 login/guard）· store/ui.ts（`role` mockup toggle,無真 identity）· top-bar L42-51 + sidebar L126-144（sign-out/identity 落點）· requests.ts L106-107（"My queue" 已預留 AUTH）· package.json 零 msal dep。
- Plan:寫 `W10-auth-fe-sso/plan.md`（+ checklist + progress）。**關鍵 = 拆 AUTH-2a（唔卡 IT,驗得到:scaffold + UI 視覺 + token 機制 + dev-bypass 相容）/ AUTH-2b（卡 app reg:真 sign-in → token e2e）**,避 FE-Assets 空殼覆轍（H7 誠實）。IT 需求 checklist 收錄 plan §7。
- 交付 IT app registration 需求 checklist（用戶可即攞去追 IT,解 blocker 前置）。

**未做 / 待敲**:
- **plan 待 approve**（R1:approve 咗先 code）。
- 5 個 OD 待敲:OD1 MSAL dep approve + ADR-0003（H2）· OD2 2a timing（建議 C:plan 定案,等 IT ready 一次過做,避空殼返工）· OD3 redirect/popup · OD4 dev-bypass 前端相容 · OD5 Login 視覺來源（handoff 有無整頁 mockup)。

**🚩 flag / 誠實限制**:
- 🔴 真 SSO e2e（G7）**卡 IT app registration**（未開）→ 未 ready 前一律標未驗,唔當 done。
- Login/Settings H6 視覺來源（OD5）未確認 handoff 有無整頁 login mockup → 無 = STOP 問 owner。

**紀律自檢**:H2 MSAL dep = 第一句 STOP,劃入 OD1 approve + ADR-0003（未 `npm i`）· H3 AUTH-3 per-OpCo scope 明確 out（本 phase 只身份 + 顯示角色）· H6 Login/Settings 新畫面需 ui-design + 忠實還原 · H7 拆 2a/2b 避空殼 = done · R1 plan-first 未 code。

**（同日 approve + 開工）**:
- **plan approved → active**;OD 敲定:OD1=approve MSAL dep + ADR-0003 · OD2=**A（做 AUTH-2a full）** · OD3=**redirect** · OD4=dev-bypass env（default）· OD5=下述查證。
- **OD5 resolved**:handoff README **§0 Login 有整頁 two-panel mockup**（左 ~52% brand gradient panel + wordmark/headline/3 stats;右 form「Continue with Microsoft Entra ID」MS 4-color logo + email/password + Keep me signed in + Sign in + SSO footnote）→ **1:1 還原有依據,唔使 STOP 問 owner**（H6 滿足）。誠實落差:真 SSO 只 wire「Continue with Entra ID」（redirect),email/password 視覺還原但唔造收密碼假 form。user menu/Sign out + Settings(Preferences) 亦有 README §1 依據。
- **D0 done**:ADR-0003 Accepted（`docs/adr/0003-msal-frontend-sso.md` + README index）· checklist G5 tick。
- **D1 done**:dep `@azure/msal-browser ^5.17.0` + `@azure/msal-react ^5.5.2`（vuln 冇增）· `src/lib/auth/msal.ts`（env-driven config + `PublicClientApplication` singleton + `initMsal` initialize/handleRedirectPromise;placeholder clientId + `msalConfigured` gate 令未 config 都跑到 = dev-bypass 相容）· `main.tsx` init-before-render · `App.tsx` `<MsalProvider>` 最外層。**build 1826 modules 0 error**（compile-verified）。⚠️ 技術債:bundle 568KB > 500KB（ADR-0003 預期,之後 code-split Login/MSAL）。
- **D3 done**:api.ts `authHeader()`（dev-bypass/未 config/未登入→無 header;否則 `acquireTokenSilent`→Bearer,`InteractionRequiredAuthError`→`acquireTokenRedirect`;H4 唔 log token）落 3 fn。build 1826 0 error（compile-verified;runtime 邏輯 = D8 unit）。
- **D2 done**:`pages/login.tsx`（handoff §0 two-panel:brand `--gradient-brand` panel + wordmark/headline/3 mono stats;form Continue-with-Entra + email/password/keep + Sign in + footnote）· 新 primitive `checkbox.tsx` · `--gradient-brand` token（mid stop reuse `--accent-deep`）· MS 4-square logo（DS-6 exception）· `RequireAuth` gate（dev-bypass skip / 未登入→/login）· router `/login` route。**render 驗 light+dark 對 §0**（DOM:gradient resolved 正確 / SSO disabled + note / MS 4 rect / email·Sign in disabled;screenshot 兩 mode 靚無爆）。H6 DS 自檢全過。誠實:未 app reg → SSO button disabled + 明示,email/password 視覺還原但唔 wire。
- **D4 done**:`lib/auth/use-current-user.ts`（msal account → name/email;dev-bypass → 誠實 "Developer/Local dev-bypass"）· sidebar user card 真 identity 取代硬派名 + sign-out（logoutRedirect,非 dev-bypass）+ 移除 unused role。build 0 error。honest gap:後端無 /me role endpoint → role 留 AUTH-3;topbar user-menu avatar defer（sidebar 已有 sign-out）。
- **D5 done**:`pages/settings.tsx`（4-tab）+ `/settings` route + sidebar Administration nav + top-bar title map。Account（profile 真 identity disabled + SSO note + sign-out/dev-bypass honest）· Preferences（theme SegmentedControl 真 + more coming-soon）· Users&roles/Integrations（coming-soon EmptyState,無 endpoint 誠實）。修 top-bar `/settings` title（原 fallback "LicenseOps"→"Settings"）。
- **D7 done**（render 驗）:dev-bypass 前端相容 —— gate skip + token 唔 attach,現有畫面照跑。
- **render 驗（live bypass on）**:route `/` 冇 redirect（gate skip）· shell render · sidebar "Developer/Local dev-bypass" 無 sign-out · Settings 4-tab（Account disabled profile + dev-bypass note / Preferences theme control / tab 切換 / top-bar title "Settings"）。screenshot renderer busy → DOM 驗結構（W08 pattern;Settings = 既有 primitive 組合,Login 已 light+dark 視覺驗）。
- **D6 done（honest 略去）**:查證 list 冇 handler expose + detail `handledById` 係 AppUser.id（前端 useCurrentUser 只 msal account,無 AppUser.id match）→ "My queue" 仍做唔到 → honest 略去 + 精確化 requests.ts comment（真正解封需後端 handler-read + /me endpoint mini-phase）。唔造假 "my" filter。
- **D8 done**:`api.test.ts`（export `authHeader` + `vi.hoisted` getter mock `@/lib/auth/msal` + 真 `InteractionRequiredAuthError` 保 instanceof）測 **6 分支**:dev-bypass→無 header 且唔攞 token / 未 config→無 header / 未登入→無 header / silent→`Bearer` / InteractionRequired→`acquireTokenRedirect`+無 header / 其他 error→無 header 無 redirect（防 redirect loop）。**同步修現有 web test**:`app-shell.test.tsx` render `<Sidebar>` 缺 `QueryClientProvider`（Sidebar 自 FE-3 用 `useDrift` → "No QueryClient set";`useMsal` msal-react 無 provider 返 stub 唔 throw → 只需補 Query provider）→ **8 tests passed**。build 1831 modules 0 error(tsc 揭 `InteractionRequiredAuthError` 需 ≥2 args → 補);lint exit 0（順帶 `--fix` 格式化 D1-D5 檔）。

**Phase Gate（AUTH-2a closeout,2026-07-10)**:
- ✅ G1 build 0 error(1831 modules;578KB warning = ADR-0003 已知,code-split defer)· ✅ G2 Login/Settings 對 prototype(light+dark,ui-design DS 過)· ✅ G3 token-attach 6 unit 綠 · ✅ G4 現有流程不破(dev-bypass live + 8 test 綠)· ✅ G5 ADR-0003 Accepted · ✅ G6 H4(env-driven,token/claim 唔 log)· ✅ G8 lint clean · 🔴 **G7 真 SSO e2e = 卡 IT app reg,標未驗（AUTH-2b)**。
- **7/8 gate 過;唯一未過 = G7,誠實卡 IT,唔當 done。**

**Retro（AUTH-2a)**:
- ✅ 拆 2a/2b 策略成功:全部可驗嘅（scaffold + UI + token 機制 + dev-bypass + unit）今日交清,唔靠空殼冒充 done（避 FE-Assets 覆轍,守 H7）。
- ✅ 意外收穫:D8 揭出 `app-shell.test.tsx` 自 FE-3 加 `useDrift` 已默默 RED（無 QueryClientProvider）—— 呢個 phase 一併修返綠,回補 W08 遺漏。
- ✅ 誠實落差全部標明:SSO button disabled + note、email/password 唔 wire、role 顯示留 AUTH-3、"My queue" 留後端 mini-phase、真 token e2e 留 2b。
- ⚠️ 技術債:bundle 578KB > 500KB（ADR-0003 預期）→ 之後 code-split Login/MSAL chunk（BACKLOG 記）。
- **下一步（待 IT）**:IT 開 SPA app registration（plan §7 checklist)→ 填 `VITE_ENTRA_*` env → AUTH-2b:真 sign-in → token → API 200 → identity → sign-out 一條 live 驗（G7)→ 之後正式 close W10。**未經 Chris 指示唔自行開 2b/AUTH-3。**

---

## Day N — 2026-07-15（AUTH-2b readiness prep — Chris kickoff「開始 AUTH-2b」）
- **狀態確認(Chris,AskUserQuestion)**:IT SPA app registration = **未開 / 仍等 IT** → G7 live e2e **仍 blocked**,誠實唔當 done(H7）。
- **本輪 = readiness 準備**(唔寫新 code — AUTH-2a 前端已全交付;兩件 AI 做唔到:創建/consent app reg + 真 sign-in 輸帳密):
  - **前端 wiring 就緒驗證(第一手)**:`lib/auth/msal.ts`(env-driven + `msalConfigured` gate + `initMsal` redirect + dev-bypass + H4 logger)· `lib/api.ts authHeader`(local-cookie/dev-bypass/unconfigured→無 header;否則 `acquireTokenSilent→Bearer`;interaction→`acquireTokenRedirect`;H4 唔 log)—— 真值一填即啟真 SSO。**web build ✓(tsc+vite,msal-vendor 254KB)· vitest 85 綠**。
  - **新 `apps/web/.env.example`**(原本連 .env 都冇):列齊 5 個 key(`VITE_ENTRA_CLIENT_ID/TENANT_ID/API_SCOPE/REDIRECT_URI` + `VITE_AUTH_DEV_BYPASS`),全非 secret(SPA PKCE 無 client secret),註明來源。
  - **新 `AUTH-2b-RUNBOOK.md`**:self-contained ①IT app-reg handoff(兩個 app reg 精確設定 + 5 回傳值,可直接交 IT)②值到後 config 步驟(web + 後端 audience,關 dev-bypass)③live-run + G7 驗證清單(6 步)④readiness 驗證結果 ⑤常見坑(scope/audience 401、第三方 cookie、redirect URI 逐字、dev-bypass leak)。
- **產出**:`apps/web/.env.example` + `AUTH-2b-RUNBOOK.md`。值齊後 Part C 約 10 分鐘跑完 G7。
- **仍 blocked**:G7 未驗 = W10 仍 `active`;等 IT app reg。**真 sign-in 輸帳密 = 人手**(AI 唔代入 credential);AI 可 sign-in 後幫驗 token attach / API 200 / identity / sign-out。
