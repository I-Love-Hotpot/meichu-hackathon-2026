# 藥伴 MedCompanion
## itel NEO R60+ 用藥資訊助手
### 產品需求與前後端系統規格書 v0.2｜證據核對版

**文件日期：2026-09-19｜狀態：黑客松設計稿；v0.2 將辨識流程改為「證據足夠才確認」，並補入目前前端所需的後端 API 契約**

讓使用按鍵手機的人，以影像作為入口，補齊足以核對藥品身分的證據；只有在規則通過後才顯示單一產品與規格，再以大字與語音理解日常生活注意事項。

**核心主張：影像辨識只產生內部假設；證據核對通過後才對使用者顯示單一已核對藥品結果。無法確認時，系統應指出缺少什麼，而不是要求使用者猜。**

本版以「台灣藥品資料、繁體中文、20–30 個明確藥品品項、小範圍展示」為規劃假設；不是已確認的市場選擇。採用者、照護者與藥師共同完成核對，而非讓使用者獨自承擔辨識責任。

**第一個必須驗證的風險**

官方 R60+ 設備頁標示 Cloud Phone 2.5.0；平台文件表示檔案上傳需要 2.7.0 以上。必須先測試手上設備實際版本、檔案選取與上傳，才決定是否以「R60+ 自行拍照」作為主流程。設備頁不等於手上設備的即時韌體狀態。[S01][S02]

**本版不宣稱完成的事項**

尚未實機驗證、尚未訓練或測量模型表現、尚未完成藥師審查、尚未確認各國法規分類。下文所有延遲、樣本數、成功率與保留期間，除另標來源外，皆為建議規格或待驗證目標，不是既有成果。

**安全邊界**

提供「證據驅動的藥品核對」與可追溯的藥品衛教；一般使用者不會看到 verification service 的 Top-K、模型分數、候選清單或內部假設，也不能靠按鈕自行把未知藥標成已確認。系統只在必要證據完整、沒有關鍵矛盾且符合已驗證規則時顯示單一已核對結果；否則要求補證據或停止確認。不診斷、不開藥、不調整劑量、不指示停藥、不保證可以服用，也不憑照片驗證藥品真偽或化學成分。

閱讀順序：產品與平台（01–03）→ 使用流程與前端（04–06）→ AI 與資料（07–10）→ 後端與 API（11–15）→ 安全、驗收與執行（16–20）→ 來源（21）。

## 本次前端對齊增補（2026-09-19）

本次增補以目前 `medaboutyou-app/frontend` 已實作的欄位、畫面與按鍵操作為 API 契約輸入，主要補齊第 10、12、14、15、18 節。前端目前仍是黑客松互動原型，資料暫存在 `localStorage`；後端接入後，伺服器資料才是唯一真實來源，前端快取不得作為跨裝置同步、授權、刪除完成或服藥紀錄完成的依據。

目前前端已有「可能的藥物清單」翻卡頁，但 2026-09-19 的產品決策確認採 **證據足夠才顯示單一藥品**。因此該候選卡頁只屬目前的互動原型，不是後端 API 契約，也不要求後端提供候選卡的圖片、主作用、副作用、適應症或排序分數。

- verification API 不向一般使用者回傳影像 Top-K、向量距離、候選清單或把模型分數包裝成正確率。
- 證據足夠時只回一個 `verified` 產品與規格；不足時回 `needs_evidence`，仍無法排除其他可能時回 `unable_to_verify`／`conflict`。
- 串接後端時，前端的「可能的藥物清單」需改成上述核對狀態頁；此 UI 調整留到實際 API 串接工作處理。
- 使用者仍可選擇手動建立個人藥品；手動項目標記 `unverified_user_entered`，不需要再次 query，也不能因人工輸入名稱而成為 verified。
- 帳號／長期持久化的改造延後到後端串接；目前文件保留 session 與 owner 邊界，但不要求本輪修改前端 `localStorage`。

因此，後端必須把「身分核對」「個人藥品管理」「服藥紀錄」視為不同資源與信任層級，而不是用一個 `medicine` 物件混在一起。


<!-- PAGE -->
# 01｜產品定義與範圍

## 1.1 要解決的任務

使用者拿到藥後，未必能辨讀藥袋，也不一定知道注意事項如何影響工作與生活。本產品讓使用者完成三件事：「這顆藥能不能被可靠核對？」「核對完成後有哪些與生活有關的提醒？」「下次需要時，能否不重新辨識就再聽一次？」此為待訪談驗證的需求假設，不預設所有高齡者或低資源地區都有相同需求。

核心產品原則是 **verification-first**：影像模型可以在後端產生多個內部假設，但一般使用者不負責在候選藥品之間猜選。每一次對外的「已核對」都必須有可追溯證據、核對範圍與版本；證據不足就停在「需要補充資料／目前無法確認」。

| 角色 | 核心任務 | 設計回應 |
|---|---|---|
| 使用按鍵手機的用藥者 | 少輸入、知道目前是否核對完成、看懂／聽懂提醒 | 一頁一個任務、大字、分段朗讀；不要求從候選中猜選 |
| 照護者／家屬 | 協助拍照、提供原包裝／藥袋等證據、管理授權 | 另一支手機網頁、短效配對、可撤回連結；不能自行授予「已核對」狀態 |
| 藥師／醫療合作人員 | 審查衛教、處理證據矛盾與必要的人工核對 | 來源並排審查、證據鏈、可稽核核對紀錄 |
| 系統管理者 | 維護資料、模型與規則版本，不擅自發布醫療文字 | 角色分權、版本化、停用與回復機制 |

## 1.2 暫定展示邊界

**國家與語言：** 台灣資料包、繁體中文文字與語音；介面預留 country_code 與 locale。國際化不只是翻譯，要換成當地核准藥品、標示、服務聯絡資訊與內容審查流程。

**藥品範圍：** 20–30 個可明確核對來源、規格與外觀的錠劑／膠囊品項；品項以產品與規格計，不以成分計。必須包含容易混淆的外觀，不只選顏色特殊、容易成功的樣本。

**輸入範圍：** 單顆藥的正反面照片為影像證據；藥袋／原包裝／可驗證調劑資料為身分核對證據；人工品名或查詢碼僅能用於查公開產品資料，不能單獨證明眼前裸藥身分。影像輸入取決於平台第一關。拒絕一把混合藥、粉末、破碎藥、液體及無法辨讀的輸入，不勉強給答案。

**長期使用：** 從已登錄且標示核對狀態的藥單，查看一般生活提醒與重播衛教。未取得實際服藥紀錄時，只能說「已登錄藥品」，不能說「今天已服用」。

## 1.3 MVP 明確不做

不做兒童／孕婦／腎肝功能的自動劑量建議；不做完整多重用藥交互作用判定；不提供自由問診型聊天；不以照片判定過期、偽藥或有效成分含量；不承諾離線辨識、背景推播與可靠服藥鬧鐘。

**成功定義：** 在已公布的展示範圍內，系統能蒐集必要證據、判斷是否足以核對、通過時只顯示單一產品與規格並解鎖已審查提醒；面對錯誤輸入、未知藥、相似藥、規格矛盾或資料不足時，不顯示猜測藥名，而是要求特定補充證據或清楚停止確認。


<!-- PAGE -->
# 02｜平台限制與 Gate 0 實機驗證

## 2.1 不可先假設的能力

| 能力 | 官方文件所示 | 本案決策 |
|---|---|---|
| 螢幕與執行環境 | R60+ 為 240×320；網頁在雲端 Chromium 執行 [S01][S04] | 做 Cloud Phone Web Widget，不先做 Android APK |
| 圖片／檔案上傳 | 上傳至少 2.7.0；R60+ 設備頁標示 2.5.0 [S01][S02] | 第一優先實測；失敗則改照護者上傳或人工查詢 |
| 即時錄音 | 文件要求 3.0 以上，並須偵測能力 [S02][S06] | 語音輸入不是 MVP 必要條件 |
| 語音輸出 | 可播放遠端音訊；Web Speech API 不可用 [S02][S06] | 使用經審查音檔或伺服器產生的音檔 |
| 慢速朗讀與音量 | playbackRate 無效；音量有專用 API [S06] | 預先產生慢速音檔，功能偵測後顯示音量操作 |
| 儲存與離線 | localStorage／IndexedDB 位於雲端 [S05] | 不把網頁快取宣稱為手機離線能力 |
| 背景能力 | 推播、Background Sync、WebRTC 不可依賴 [S02] | MVP 採開啟後查詢；不承諾關閉 App 仍會提醒 |

## 2.2 Gate 0 必測紀錄

建立 `/device-check` 測試頁，記錄機型、手動查得的韌體資訊、User-Agent、測試日期、SIM／Wi-Fi、能力回傳值及實際成功／失敗。`navigator.hasFeature` 可偵測 ImageUpload、FileUpload、AudioPlay 等，但回傳支援仍不等於權限、硬體和整條流程成功。[S03]

**上傳：** 以 `<input type="file" accept="image/*">` 實際開啟原生選取器；確認是否只能選既有照片、是否能回到 App；實際把檔案傳到自有後端並解碼。`capture` 屬性不等於保證能直接叫起相機，不使用不存在的「拍照 SDK」假設。

**影像品質：** 記錄收到的像素、格式、檔案大小、最近可對焦距離、刻印清晰度與正反面成功率。畫面預覽尺寸不等於後端收到的圖片解析度；雲端算力不能補回鏡頭未拍到的細節。

**操作與音訊：** 確認方向鍵、中央鍵、兩側軟鍵、返回後焦點、中文字體；測試 HTTPS 音檔首次播放、暫停、重播、慢速版與離開頁面停止播放。測試低訊號與暫時斷線下的狀態恢復。

## 2.3 第一關的三種結果

**A：可上傳且畫質足夠。** 採 R60+ 本機選圖／拍照後上傳主流程。

**B：不能上傳，或影像品質不足。** 由照護者／藥師的另一支手機上傳，R60+ 透過短效配對接收待核對資料；或輸入品名／印在藥卡上的查詢碼。展示必須清楚標示照片來自哪個裝置。

**C：展示時連線也不可靠。** 準備事先錄製的真實流程備援，現場標明錄影而非即時結果。不得把桌面模擬器成功當作 R60+ 實機驗證成功。


<!-- PAGE -->
# 03｜功能需求與優先級

P0 為完成展示閉環所需；P1 為核心可行後再做；P2 為需要新資料、醫療治理或平台支援的後續項目。安全控制不能因為是黑客松而改成僅放免責文字。

| ID／優先 | 需求 | 可驗收條件 |
|---|---|---|
| PLAT-01／P0 | 能力偵測與替代入口 | 不支援上傳時不顯示無效拍照按鈕；顯示人工／協助上傳 |
| UX-01／P0 | 全按鍵導覽 | 所有必要任務不用滑鼠或觸控，焦點可見且能返回 |
| IMG-01／P0* | 單顆藥正反面影像 | *A 路線在 R60+ 完成；B 路線由已配對照護端完成 |
| AI-01／P0 | 內部候選檢索 | 模型 Top-K 只供後端核對服務使用，一般使用者 API／UI 不回傳候選、排名或分數；只有完整 Gate 通過才回單一產品 |
| VER-01／P0 | 證據核對引擎 | 依外觀、刻印、標籤／包裝、規格與資料版本套用硬性 Gate；通過才產生單一產品結果 |
| VER-02／P0 | 主動補證據 | 缺正面、背面、清楚刻印或標籤時，明確指出下一個要補的證據，不顯示猜測藥名 |
| VER-03／P0 | 矛盾阻斷 | 含量、劑型、刻印、正反面、國家或來源矛盾時一律阻止自動確認，不允許模型高分抵銷 |
| VER-04／P0 | 核對範圍 | 結果必須標明是 package_label、physical_pill_to_label、pharmacist_review 等範圍；不把包裝核對說成化學驗真 |
| MED-01／P0 | 來源可追溯的衛教 | 只有核對結果符合產品／規格範圍時才解鎖對應發布卡；每張卡含來源版本與審查資料 |
| UX-02／P0 | 文字＋分段朗讀 | 語音與文字同版本；可暫停、重播，失敗保留文字 |
| LIST-01／P0 | 我的藥單示範 | 只把符合允許狀態的項目放入「已核對」區；需要補證據者獨立列出 |
| ADMIN-01／P0 | 最小維護後台 | 匯入品項、對照來源、維護核對規則、草稿／發布、立即停用 |
| SAFE-01／P0 | 安全與授權 | 未知不能變成安全；客戶端不得指定 verified；跨使用者不可讀取圖片／藥單 |
| OPS-01／P0 | 可重現展示 | 每次結果記錄模型、索引、catalog、verification rule、內容版本與原因碼 |
| OCR-01／P1 | 刻印／標籤 OCR 輔助 | 低信心字元保留 unknown；OCR 只能成為證據，不得自行補字後直接通過 |
| CARE-01／條件P0 | 照護者配對 | 若選 B 路線即為 P0；短效、一次性、雙端確認與撤權 |
| PHARM-01／P1 | 藥師人工核對 | 處理模型無法排除的相似藥或證據矛盾；核對結果與證據鏈可稽核 |
| PERSONAL-01／P1 | 活動情境排序 | 駕駛／操作機械等只重排已審查提醒，不推算安全性 |
| DD-01／P2 | 藥物交互作用 | 取得合適資料授權、完整藥單與專業審查後另定規格 |
| LOCAL-01／P2 | 新國家與語言 | 當地藥品資料、核對規則、語音與醫療文字全部重新核對 |

## 最小展示切面

建議先完成「1 個影像入口 → 品質檢查 → 內部比對 → 要求必要證據 → verification engine → 單一核對結果／無法確認 → 3 類生活提醒 → 語音 → 我的藥單」。至少準備 3 個證據完整可通過案例、1 個外觀高度相似但規格不同案例、1 個證據矛盾案例與 1 個未知輸入。

**範圍削減順序：** 先刪自由問答、登入花樣、複雜圖表、多語系、即時 TTS；再縮支援藥品數量。不可刪除證據 Gate、矛盾阻斷、拒答、來源與實機鍵盤體驗。


<!-- PAGE -->
# 04｜使用者流程與頁面規格

## 4.1 主流程

開始 → 選擇國家／語言與資料說明 → 首頁 → 輸入方式 → 影像品質檢查 → 系統內部比對 → 證據完整性檢查 → 必要時逐步補證據 → verification engine → 「核對完成」或「目前無法確認」→ 核對完成才顯示該產品的一般衛教 → 收藏／查看藥單。

**本節的 verification-first 正式核對流程不包含候選選擇頁。** 後端可以為演算法除錯保存內部排名，但不把「最像的三個」傳給一般使用者。首次不要求建立個人帳號即可提交受控展示案件；要把某顆實體藥與產品建立核對關係，必須走證據流程。

| 頁面 | 主要內容與操作 | 例外狀態 |
|---|---|---|
| 首頁 | 1 核對藥品；2 我的藥單；3 查產品資料；0 朗讀本頁 | 無音訊能力時以文字提示替代 |
| 輸入選擇 | 本機選圖／請他人協助；人工查詢獨立標示為「查資料」 | 不支援的選項直接隱藏並說明替代路徑 |
| 拍攝引導 | 一次一顆、單純背景、拍正反面，優先保留可見刻印 | 無法辨讀時要求更換角度／距離；不反覆叫使用者做無目的重拍 |
| 上傳與處理 | 顯示「上傳中／圖片檢查中／核對中」，提供取消 | 不顯示虛構精確百分比；逾時可返回後查詢狀態 |
| 補證據頁 | 一次只提出一個具體要求，例如「請補拍背面」「請拍藥袋上的品名與含量」 | 若證據無法取得，可選「我沒有這項資料」並轉無法確認／藥師協助 |
| 核對結果頁 | 通過時顯示唯一產品、規格、核對範圍與使用到的證據摘要 | 不通過時不顯示候選藥名；列出原因與下一步 |
| 衛教頁 | 僅在結果範圍允許時顯示對應產品的生活注意、常見副作用、警訊與來源 | 無已審查資料時明示缺資料，不顯示「無禁忌」 |
| 我的藥單 | 已核對項目、需補證據項目分區；一鍵重播一般提醒 | 舊資料或規則版本失效時要求重新核對，不推斷仍在服用 |

## 4.2 補證據策略

補證據不是「再拍一次」的泛用錯誤訊息，而是由後端 reason code 指出目前最有資訊增益的下一步。優先順序可依情境調整：

1. 影像本身不合格：要求重拍同一視角，說明模糊、反光或藥品太小。
2. 缺另一面：要求補拍同一顆藥的另一面；前後面需有同一案件綁定與使用者提示，避免拍到不同顆。
3. 刻印不足以區分：要求清楚刻印／標誌；低信心 OCR 不能猜字。
4. 外觀仍存在不可排除的 look-alike：要求原包裝／藥袋或可驗證調劑資料。
5. 來源之間衝突：停止自動核對，轉人工／藥師流程，不以加權平均消除矛盾。

## 4.3 兩個備援流程

**人工產品查詢：** 輸入品名、許可證資訊或公開查詢碼 → 查看該產品的公開資料。此流程是「查某個已知名稱的產品」，不是「確認眼前未知裸藥」；除非另有證據把實體藥與該產品連結，不能建立已核對藥單。

**照護者協助：** R60+ 產生配對碼 → 照護者在另一裝置輸入 → R60+ 顯示對方身份與請求範圍 → 使用者同意 → 對方上傳標籤／包裝／藥品照片 → 核對服務重新評估。照護者提供證據不等於藥師核對，也不能直接設定 verified。

## 4.4 退出與恢復

返回不得默默新增藥單或提升核對狀態。重入 App 後顯示案件目前是「蒐集證據／核對中／需要補證據／已核對／無法確認」。只有伺服器已接收的任務與證據能恢復；查詢中斷不應讓使用者誤以為完成核對。

## 4.5 目前前端已實作流程與後端接點

下表以目前畫面為基礎，但套用「證據足夠才顯示單一結果」的產品決策。現有候選卡頁會在 API 串接時改成核對狀態頁，後端不為原型候選卡建立相容端點。

| 前端流程 | 畫面順序 | 後端責任 | 最終資料狀態 |
|---|---|---|---|
| 拍照／選圖核對 | 新增藥品 → 拍照或選圖 → 核對中 → 補證據／單一結果／無法確認 | 建立 media 與 `verification_case`、輪詢狀態；缺證據時指出下一項，不回候選 | 通過 Gate 才能是 `system_verified` |
| 核對完成後新增 | 單一已核對結果 → 每日服用 → 提醒時間 → 新增完成 | 由 verification decision 建立個人藥品並保存提醒；客戶端不能指定 product_id／verified | `system_verified` |
| 核對流程改用手動輸入 | 無法確認／使用者退出 → 手動輸入名稱＋用法 → 直接儲存 → 新增完成 | 不發第二次辨識或產品候選 query；直接建立手動藥品 | `unverified_user_entered` |
| 新增藥品的手動輸入 | 新增藥品 → 手動輸入名稱＋用法 → 直接儲存 | 人工名稱不能單獨證明眼前藥品；本輪後端只支援直接儲存。是否另做公開產品搜尋留待 API 串接時決定 | `unverified_user_entered` |
| 編輯藥品用法 | 我的藥品 → 個別藥品 → 用法 → 修改 → 儲存 | 以版本條件更新 `user_directions` | 回同一藥品詳情 |
| 編輯提醒 | 我的藥品 → 個別藥品 → 提醒 → 選既有時間／第 n+1 其他時間 → 儲存 | 回傳所有啟用中藥品的時間聯集；原子取代該藥提醒集合 | 回同一藥品詳情 |
| 封存／取消封存 | 個別藥品 → 封存；已封存清單 → 個別藥品 → 取消封存 | 封存停用未來提醒但保留歷史；可逆 | `active_status=archived/active` |
| 刪除 | 個別藥品 → 刪除 → 確認 | 權限與版本檢查、停止未來提醒、建立清除工作；不可逆 UI 動作 | 依保留政策進入 deleted／purge 流程 |
| 記錄今日服藥 | 首頁 → 記錄今日服藥 → 勾選 → 完成 | 以 occurrence id 冪等 upsert 服藥紀錄 | 產生／更新 dose record |
| 歷史紀錄與數量修改 | 歷史日期 → 當日明細 → 修改數量 | 讀每日摘要／明細；版本化更新 amount/unit | 保留更新時間與 audit event |

所有「完成」畫面都只是前端導覽狀態。後端 mutation 必須在進入完成畫面前已成功提交；完成後前端會清除中間瀏覽歷史，使右軟鍵回到主畫面。重複按鍵、重新整理或返回不得重複建立 verification case、個人藥品或服藥紀錄，因此建立類 API 必須支援 `Idempotency-Key`。


<!-- PAGE -->
# 05｜小螢幕、按鍵與內容呈現

## 5.1 版面規則（本案建議值）

以 240×320 為主測試尺寸，單欄排版；正文 20–24 CSS px、標題 24–28 px 起測，依繁體字實機可讀性調整。每頁一個主要任務與約 3–4 個選項；視覺焦點使用邊框與反白，不只改字色。長品名、規格和警語要換頁或展開，不能省略關鍵字。

| 按鍵 | 建議行為 | 衝突處理 |
|---|---|---|
| 上／下 | 移動焦點或逐段閱讀 | 不讓焦點落到不可見區域 |
| 左／右 | 內容／證據說明分頁 | 僅在有明確分頁提示時使用 |
| Enter | 執行目前焦點項目 | 防止長按重複提交；動作需有可見回饋 |
| 左軟鍵 | 本頁選單或次要動作 | 官方 key 為 Escape；畫面軟鍵標籤需一致 [S02] |
| 右軟鍵 | 返回上一層 | 處理全域 back 事件，不把它當一般 keydown [S02][S07] |
| 0 | 朗讀／重播目前頁面 | 原生文字輸入中停用快捷鍵，避免輸入 0 被吃掉 |
| 1–3 | 對應當頁選項 | 只在非輸入模式啟用；不得跨頁沿用舊映射 |

## 5.2 補證據／核對結果文案骨架

**需要補證據：**

```text
還需要核對藥品背面

目前看不清楚背面的刻印，
因此還不能確認是哪個藥品。

請將同一顆藥翻面後拍攝。

[中央鍵] 補拍背面
[左軟鍵] 我沒有這項資料
[右軟鍵] 返回
0 朗讀本頁
```

**核對完成：**

```text
藥品資料核對完成

[完整產品名稱]
[含量／單位／劑型／必要規格]

核對範圍：實體藥與標籤資料一致
依據：正面、背面、標籤資料

這不是化學成分或真偽檢驗。
[中央鍵] 查看生活提醒
```

**目前無法確認：** 不顯示 A／B／C 候選名單，也不顯示未校準的信心百分比。畫面說明是哪一項證據缺少、互相矛盾或超出支援目錄，並提供人工查詢或藥師協助。

## 5.3 衛教頁文案骨架

```text
一般藥品資訊｜生活提醒
藥品：已選擇的完整產品與規格

[經審查的短標題]
[具體行動＋必要條件]
[為什麼要注意：一個短句]

0 朗讀   Enter 下一段
選單：來源／完整說明／收藏
```

語音與文字必須來自同一內容版本。只說「嗜睡」仍不夠；要把原始標示中的行動條件一起說清楚。不得自行補上「服藥後 4 小時就能開車」等無來源的時限。部分藥物對駕駛的影響可能不只短暫發生，應依產品標示與專業意見處理。[S15]


<!-- PAGE -->
# 06｜前端工程規格

## 6.1 技術與模組

建議使用 TypeScript＋React＋Vite，輸出 HTTPS Web Widget；此為團隊可替換的選型，不是平台限定。Cloud Phone 支援標準網頁開發，但需另處理小螢幕、按鍵與平台能力差異。[S02][S04]

| 模組 | 職責 |
|---|---|
| AppShell／SoftKeyBar | 頁面標題、固定軟鍵列、當頁按鍵行為 |
| FocusManager | 焦點順序、返回後還原、捲動到可見區、禁用狀態 |
| CapabilityAdapter | 包裝 hasFeature、音量與原生輸入差異；不把 UA 當成功證據 |
| CaptureInput／ManualLookup | 本機選圖、品質引導、公開產品查詢和照護者入口 |
| VerificationFlow | 建立案件、上傳證據、輪詢、顯示下一項證據要求、取消與恢復；不渲染候選清單 |
| EvidenceCapture | 管理 front／back／label／package 等用途，避免兩張不同藥被誤當同一案件 |
| VerificationResult | 只呈現 verified／needs_evidence／unable_to_verify 等對外狀態與核對範圍 |
| EducationCard／AudioPlayer | 僅在後端允許時載入對應產品內容；版本一致性、分段音檔與重播 |
| MedicationList | 核對狀態分區、到期重新核對、資料刪除與授權入口 |
| ApiClient | 型別契約、請求逾時、CSRF、冪等鍵、錯誤碼轉文案 |

## 6.2 前端狀態機與權限邊界

前端以明確狀態機管理：

```text
idle → selecting → uploading → evaluating
     → needs_evidence → uploading → evaluating ...
     → verified
     → unable_to_verify
     → failed / canceled / expired
```

`verified` 只能由後端核對服務回傳；前端不存在「我確定這就是它」的升權按鈕。客戶端不得傳入 `verified=true`、`product_id` 來指定最終結果，亦不得把 `processing=done` 解讀為身分已核對。

後端若需要回傳除錯資訊，應放在管理者／開發環境契約，不能讓正式使用者介面直接取得內部 Top-K、embedding distance 或未校準信心值。

頁面離開時停止音訊與輪詢；取消請求只代表客戶端停止等待，後端是否取消成功需由案件狀態確認。重新提交使用相同冪等鍵取回同一案件，不建立多份藥單。

## 6.3 平台適配契約

```typescript
type FeatureName = 'ImageUpload' | 'FileUpload' | 'AudioPlay';
type DeviceCapabilities = Record<FeatureName, boolean>;
// navigator.hasFeature 不存在、拋錯或逾時時回 false。
// 回傳 true 後，仍需實際選圖／上傳／播放成功才能記為已驗證。
// 進入原生 input／IME 時，暫停數字快捷鍵與全域 Enter 處理。
```

## 6.4 音訊與連線

MVP 優先預先製作經審查的短音檔；標準版與慢速版各自儲存。使用 `<audio>` 並處理 `play()` 拒絕，不依賴 Web Speech、WebAudio、playbackRate 或不可靠的媒體緩衝屬性。[S02][S06]

快取僅加速雲端瀏覽器再次讀取，不代表手機斷網仍能操作。`navigator.onLine` 與 API 可達性也不能完整反映手機到 CloudMosa 的連線；實機端到端失敗必須獨立測試。[S04][S05]

## 6.5 前端欄位對照與命名規範

後端 JSON 採 `snake_case`；React 內部可轉成 camelCase。下列欄位是目前前端已使用或下一步接 API 時必須取代 fixture／`localStorage` 的最小集合。

| 前端概念 | API 欄位 | 型別／限制 | 說明 |
|---|---|---|---|
| 藥品項目 ID | `entry_id` | opaque string | 不使用陣列 index 或產品 ID 代替個人項目 ID |
| 產品關聯 | `product_id` | string \| null | 手動直接輸入可為 null；不能由此推導 verified |
| 顯示名稱 | `display_name` | 1–120 Unicode chars | 使用者輸入值原樣顯示但輸出編碼；產品名稱使用建立時快照 |
| 規格 | `strength_text` | string \| null | 例如 `10 mg`、`800 IU`；另保留結構化 amount/unit 時不得只存此字串 |
| 用法 | `user_directions` | 0–500 chars | 前端統一顯示為「用法／Directions」；是使用者可編輯資料，不等於官方處方或醫囑 |
| 服用頻率模式 | `schedule_type` | enum | 目前 `daily/none/unknown`；前端「每天服用？」是／否分別寫 daily／none；直接手動儲存可先為 unknown |
| 提醒時間 | `reminder_times` | `HH:mm[]` | 使用帳號時區的 local wall-clock time；去重、排序、原子取代 |
| 預設數量 | `default_amount` | decimal string | 例如 `"1"`、`"0.5"`；不得使用浮點數保存醫療數量 |
| 單位 | `dose_unit` | enum | 目前至少 `pill`、`capsule`；API 回 enum，前端用 i18n 顯示 |
| 來源 | `source_type` | enum | `manual_direct`、`verified_case`、`fixture_import` |
| 核對狀態 | `verification_status` | enum | 見第 14 節；與 active/archive 狀態分離 |
| 管理狀態 | `active_status` | enum | `active`、`archived`、`deletion_pending`；deleted 不回一般清單 |
| 版本 | `version` | positive integer | PATCH／archive／delete 的 optimistic concurrency token |
| 今日項目 | `occurrence_id`、`scheduled_local_time`、`amount`、`unit`、`status` | object | `status` 至少 `pending/taken/skipped`；前端 checkbox 不直接成為資料庫布林欄位 |
| 歷史摘要 | `local_date`、`taken_count`、`total_count` | object | 日期由指定 IANA timezone 計算，不由 server UTC 日期直接切割 |

舊前端 `customDescription` 僅是原型資料遷移名稱；後端契約一律使用 `user_directions`，不得再新增 `description` 與 `directions` 兩個語意重複欄位。產品官方用法／仿單內容另屬 education／source document，不覆寫使用者的 `user_directions`。


<!-- PAGE -->
# 07｜影像辨識與模型規格

## 7.1 模型角色：提供內部假設，不直接做最終確認

沿用 DINOv2 ViT-B/14 特徵擷取與 Top-K 檢索作為第一版基準。DINOv2 是通用視覺表徵模型，不是已通過藥丸辨識驗證的醫療模型；本案必須自行驗證。[S11]

```text
照片／正反面
→ 格式與品質檢查
→ 單顆藥裁切
→ 固定前處理
→ DINOv2 embedding
→ 支援目錄內 Top-K（僅後端內部）
→ 刻印／形狀／顏色／視角相容性檢查
→ Verification Engine 取得「待驗證假設 + 證據缺口」
```

**禁止路徑：** `Top-1／Top-K → 傳給使用者選擇或直接標成已核對藥名 → 解鎖該身分的醫療結論`。模型排名只用於決定後端下一步要檢查什麼，不是對使用者的診斷或確認結果。

## 7.2 輸入與品質 Gate

每次接受 1–2 張單顆藥照片，標記 front／back／unknown；標籤與原包裝照片是獨立 evidence type，不混進同一外觀向量。後端檢查真正 MIME、解碼、像素上限、模糊、曝光、藥品占比、多物件與是否足以看見刻印。閾值依實機樣本校準，不硬抄桌面相機參數。

若尺寸是區分品項的必要證據，必須定義有尺度參照的拍攝方式；不可直接把影像像素大小當實際毫米。裁切不能把刻印截掉；保留足以稽核的受控原始輸入至保留期限。

## 7.3 內部檢索與證據抽取

每個產品可有多張參考圖，索引記錄視角、來源、雜湊、模型與前處理版本。內部先取得影像假設，再合併到產品／規格層級；雙面需要相容，不可把兩張不同藥的照片組成一個高分結果。

形狀、顏色、刻痕是排除與輔助特徵；刻印／標誌通常更具區辨性，但 OCR 仍要保留不確定字元。低信心 OCR 以 unknown 表示，不依照模型預期結果自動補字。標籤 OCR、人工輸入、影像與資料庫之間只要出現關鍵矛盾，就產生 blocking reason，而不是加權平均後硬選答案。

## 7.4 Verification Engine

Verification Engine 接收的是「內部產品假設、觀察到的影像特徵、OCR、標籤／包裝資料、可選調劑紀錄、資料與規則版本」，輸出對外狀態：

- `needs_evidence`：目前缺少能排除其他合理可能性的必要證據，並附 `next_required_evidence`。
- `verified`：在明確限定的 verification scope 內，必要證據完整、關鍵欄位一致、無 blocking conflict，且符合已驗證規則；只回單一產品與規格。
- `unable_to_verify`：超出支援目錄、證據不可取得、仍有不可排除 look-alike、或規則禁止自動確認。
- `conflict`：來源之間存在關鍵矛盾；必須停止自動確認並轉人工核對。

核對 Gate 至少檢查：國家／產品目錄、正反面一致性、刻印／標誌、產品名稱、含量與單位、劑型／釋放型式、必要製造商資訊、證據來源與有效期。**模型相似度不能覆蓋任何硬性衝突。**

## 7.5 分數與校準

向量相似度、分類 logits 或其他模型分數都是演算法分數，不得直接標示為「99% 正確」。若未來要將任何分數納入自動確認 Gate，需先在獨立開發／校準資料上驗證其與實際錯誤風險的關係，並以完整 verification pipeline 的錯誤確認率為主要安全指標，而非單一模型 accuracy。

## 7.6 訓練與部署

先凍結 encoder 建立基準；再依真機錯誤型態決定是否微調。背景、旋轉、壓縮、光線等增強不能取代真實手機拍攝測試。每次更換 encoder 或前處理後，必須重建索引並以相容版本一同部署；verification rule、catalog、模型與索引都必須可回溯，不能在同一案件途中切換。


<!-- PAGE -->
# 08｜藥品資料與匯入流程

## 8.1 三層資料，不是一張 CSV 就能完成

| 資料層 | 來源與內容 | 缺口與處理 |
|---|---|---|
| 外觀與參考圖 | TFDA 藥品外觀資料：許可證、品名、顏色、刻痕、標註、外觀圖連結 [S08] | 不包含完整副作用／飲食／生活警示；缺圖不能假裝有辨識能力 |
| 產品與成分 | 全部藥品許可證、詳細處方成分資料 [S09][S10] | 需核對含量、單位、複方、劑型、註銷與有效資訊 |
| 衛教與警示 | 對應產品的核准仿單／正式資料、藥師核實內容 | 需來源版本、適用範圍、文字與語音審查；缺資料就不發布 |

使用許可證字號作為台灣資料的關聯鍵，不以相似品名直接合併。內部另有 `product_id`；必要時將同一許可證下的規格／包裝變體拆分。保留原始欄位，不因正規化而丟掉不同劑型、含量或製造商的差異。

先前討論的 TFDA 外觀 CSV 可作為起點；本次未重新檢視該檔的實際內容，因此不把先前檔案筆數當成目前有效品項數或圖片數。

## 8.2 匯入步驟

取得來源快照與授權說明 → 記錄下載日期、SHA-256 與來源版本 → 驗證欄位與編碼 → 匯入 staging → 以許可證／規格比對 → 下載允許來源的圖片 → 真正解碼與去重 → 人工檢查產品對應 → 產生向量 → 建立版本化目錄 → 審查後發布。

下載器限制允許網域、重新導向、檔案大小、並行數與退避重試。不得接受使用者提供任意 URL 讓伺服器抓取；圖片壞鏈結、403、404、空檔、重複圖均須記錄，失敗不可當成成功樣本。

## 8.3 更新與撤回

官方三個資料集標示每週同步；本案可排程每週檢查版本差異，但衛教與安全更新需要獨立管理，不代表資料集每週同步就足以保持所有警示最新。[S08][S09][S10]

新增資料進 staging，不直接覆蓋已審查內容。註銷或撤回的產品保留歷史標記，顯示需查核；不得靜默改成另一個在售藥。來源警語異動時，相關卡片與音訊標為待複核或暫停發布。

## 8.4 跨國與授權

DailyMed 提供美國藥品標示的 API，可作經審查的補充來源，但不是台灣品項的自動映射，也不是完整交互作用資料庫。[S14] 同成分不代表同產品、同途徑或同釋放型式。

政府開放資料仍要保留授權與來源，逐項確認嵌入圖片及第三方內容的使用條件。MedlinePlus 的部分藥品內容標示 ASHP 著作權；不可因位於政府網站就整批當成可自由商用的內容。[S17]


<!-- PAGE -->
# 09｜藥品核對與醫療知識規則

## 9.1 核對狀態、範圍與允許行為

核對狀態不再以「使用者選了候選」為任何可信度來源。建議分為：

| 狀態 | 意義 | 允許的呈現／行為 |
|---|---|---|
| collecting_evidence | 尚在蒐集照片／標籤／包裝等資料 | 只說明還缺什麼，不顯示猜測藥名 |
| needs_evidence | 後端已評估，但缺少可區分的必要證據 | 回傳一個具體的 next_required_evidence；不得解鎖該藥衛教 |
| conflict | 關鍵證據互相矛盾 | 停止自動核對，轉人工／藥師處理 |
| unable_to_verify | 超出支援目錄、無法排除 look-alike、或證據不可取得 | 不顯示候選；可提供公開查詢與求助路徑 |
| system_verified | 在已定義的自動核對 scope 內通過完整 Gate | 顯示單一產品／規格、核對範圍、證據摘要；只解鎖對應的一般衛教 |
| pharmacist_verified | 授權藥師依本次證據與必要資料完成核對 | 納入已核對藥單；仍不產生劑量、治療變更或「可服用」結論 |
| dispensing_linked | 透過已驗證調劑系統建立資料連結，後續版本才做 | 依來源範圍使用，不把電子紀錄連結說成實體藥品化學驗真 |

`system_verified` 不是「這顆藥的化學成分已被儀器驗證」。結果必須附 `verification_scope`，例如：

- `package_label_only`：只確認包裝／標籤資料對應某產品，不能推論旁邊散裝裸藥一定來自該包裝。
- `physical_pill_to_label`：在本系統定義且驗證過的條件下，實體藥外觀／刻印與該標籤／產品資料一致；仍不驗證偽藥、成分純度或有效含量。
- `pharmacist_review`：藥師針對本次案件與證據做人工核對。

身份核對與內容審查仍是兩件事：一篇藥師審查過的衛教不會讓任何照片自動變成已確認藥品；即使產品身分已核對，也不能推知實際服藥時間、個人體內藥效或是否適合該使用者服用。

## 9.2 證據類型與硬性規則

| evidence_type | 用途 | 限制 |
|---|---|---|
| pill_front / pill_back | 外觀、刻印、標誌、正反面一致性 | 不單獨證明化學成分；畫質不足即不採用 |
| package_label | 品名、規格、製造商／許可資訊 | 只能證明包裝標示內容；需另證明與實體藥的關聯 |
| dispensing_record | 核對一次調劑中的產品資料 | 不能自動把藥單中的每個產品分配到眼前每一顆裸藥 |
| user_entered_text | 協助查詢或補欄位 | 不作為單一高可信證據；需標示來源為使用者提供 |
| ocr_observation | 從刻印／標籤提取文字 | 低信心保留 unknown；不能依模型答案補字 |
| pharmacist_review | 對案件證據與產品關係做專業核對 | reviewer 必須來自登入身份，不接受客戶端自稱角色 |

硬性規則：任何關鍵規格衝突都阻止自動通過；「資料庫中只剩一個候選」不等於現實世界只剩一種可能；系統必須持續考慮 out-of-catalog 輸入。

## 9.3 醫療內容分類與規則欄位

分開儲存：常見副作用、需緊急處理的警訊、食物／飲料交互作用、服用間隔或與餐食關係、生活活動限制、適用族群與禁忌。不能把所有提醒都翻成「禁止」。葡萄柚也不是對所有同類藥物都有相同影響，不能做成對所有藥一律禁止的規則。[S16]

每條規則至少有 `rule_id、version、product_scope、ingredient_scope、route、formulation、country、category、severity、condition、action、plain_text、source_id、source_span、review_status、reviewer_id、reviewed_at、review_due_at`。

條件採 `true / false / unknown`：缺少必要資料時是 unknown，而不是 false。必要規格不明時，不發布該特定規則；沒有相符卡片時顯示「目前沒有足夠資料」，不顯示綠色安全勾。

## 9.4 生活情境與排序

使用者可選「需要駕駛／騎車」「操作機械」「想了解飲食提醒」；只把已適用且已審查卡片排前，不把這些選項變成診斷。最重要的完整警語不得因排序或篇幅被省略；畫面可摘要，但必須保留必要條件與下一步。

## 9.5 LLM 的位置

MVP 不開放自由醫療聊天。LLM 若使用，只能在後台協助從合法來源整理草稿、對齊段落、提出簡明文字；輸出預設不可發布。藥師核對來源、產品範圍與翻譯後才能生成並審聽音檔。LLM 也不能參與最終「是哪顆藥」的自由文字決策；verification 必須由可測試、版本化的模型輸出與規則引擎完成。


<!-- PAGE -->
# 10｜資料庫模型與一致性

建議 PostgreSQL＋pgvector；小型參考庫先採精確向量搜尋，量與延遲需要時再評估近似索引，不同時引入多套向量資料庫。[S12] 下列為邏輯表，實作可合併少量關聯表，但不可混淆身份、內容與模型版本。

| 實體 | 主要欄位／關聯 |
|---|---|
| regulatory_licenses | id、country、license_no、status、valid_until、source_snapshot_id |
| products | id、license_id、name_zh/en、manufacturer、dosage_form、route、release_type、variant_key、catalog_status |
| ingredients／product_ingredients | 成分 ID；product_id、ingredient_id、amount、unit、basis、raw_text；支援複方 |
| appearance_refs | id、product_id、view、shape、color、imprint、object_key、sha256、source_id、verified_at |
| image_embeddings | ref_id、model_version、preprocess_version、embedding；維度依鎖定模型輸出確認 |
| source_documents | id、publisher、country、language、title、url、version、effective_at、fetched_at、hash、license |
| education_rules／rule_versions | 規則 ID；不可變版本、適用條件、文字、severity、source_span、reviewer、status |
| audio_assets | rule_version_id、language、speed_variant、object_key、text_hash、review_status |
| accounts／sessions | 主體 ID、角色、國家、語言、expires_at；session 與帳號關聯可為空 |
| uploads／verification_cases／recognition_jobs | owner_id、purpose、expires_at、案件狀態、reason_code、next_required_evidence；recognition job 為內部模型工作 |
| recognition_hypotheses | case_id、product_id、rank、model_score、observed_features、model_version；僅內部，不直接對一般使用者輸出 |
| identity_evidence | case_id／entry_id、type、media_id、observed／asserted value、confidence_metadata、provider_id、source_ref、created_at、validity |
| verification_decisions | case_id、status、product_id、verification_scope、blocking_reasons、evidence_ids、rule_version、catalog_version、reviewer_id、decided_at |
| medication_entries | owner_id、product_id、verification_decision_id、verification_status、active_status、last_verified_at、version |
| caregiver_links／pairings | 授權雙方、scope、expires_at、revoked_at；配對碼雜湊與嘗試次數 |
| reviews／feedback／audit_events | 審查決議、使用者回饋、操作者、事件時間與版本；回饋不是訓練真值 |

## 10.1 前端功能需要補充的持久化實體

| 實體 | 必要欄位／索引 | 行為與限制 |
|---|---|---|
| medication_entries | id、owner_id、product_id nullable、verification_decision_id nullable、source_type、verification_status、display_name_snapshot、strength_text、user_directions、schedule_type、default_amount、dose_unit、active_status、archived_at、version、created_at、updated_at | 個人管理資源；名稱與產品快照保證來源更新後仍可解釋既有紀錄；手動 entry 可無 product_id |
| medication_reminders | id、entry_id、local_time、timezone、enabled、created_at、updated_at | `(entry_id, local_time, timezone)` 唯一；封存 entry 時停止產生未來 occurrence，但不刪過去紀錄 |
| dose_occurrences | id、owner_id、entry_id nullable、medicine_display_name_snapshot、strength_text_snapshot、scheduled_local_date、scheduled_local_time、scheduled_at_utc、amount、unit、schedule_version、status | 由提醒／排程展開的可記錄項目；`(entry_id, scheduled_at_utc, schedule_version)` 唯一；刪除 entry 後仍以快照解釋歷史；時區規則變更需可追溯 |
| dose_records | id、occurrence_id、owner_id、status、amount、unit、taken_at、recorded_at、updated_at、version | 同一 occurrence 至多一個目前紀錄；更新數量保留 audit／revision；沒有提醒時也可允許 ad-hoc occurrence |
| medication_entry_revisions | entry_id、version、changed_fields、before_json、after_json、actor_id、request_id、created_at | 用法、提醒、封存與復原的稽核資料；敏感欄位依保留政策處理 |
| deletion_jobs | id、owner_id、resource_type、resource_id、status、requested_at、completed_at、failure_code | DELETE 回 202 時可查詢；區分 UI 隱藏、資料庫 tombstone、物件儲存／備份實際清除 |
| emergency_profiles | owner_id、allergy_text、notes、version、updated_at | 前端目前只做展示；若上線必須明示是使用者提供資訊，不由系統推論 |

### 建議 enum

```text
medication_entry.source_type = manual_direct | verified_case | fixture_import
medication_entry.verification_status =
  unverified_user_entered |
  collecting_evidence | needs_evidence |
  system_verified | pharmacist_verified | dispensing_linked |
  unable_to_verify | conflict | verification_expired
medication_entry.active_status = active | archived | deletion_pending
medication_entry.schedule_type = daily | none | unknown

dose_record.status = pending | taken | skipped
dose_unit = pill | capsule | ml | drop | puff | other
```

`verification_status` 與 `active_status` 必須正交：已核對藥品也能封存；手動未核對藥品也能保留提醒。封存不是停藥醫囑，刪除也不能竄改過去的 dose record 統計。

## 10.2 必要約束

**產品：** country＋license_no 唯一；product 的 variant_key 在許可證內唯一。含量用十進位數與獨立單位儲存，同時保留原文，避免 mg／mcg 或鹽類基準被錯誤正規化。

**內容：** 發布版本必須有來源、有效適用範圍與授權審查者；音檔 text_hash 對應同一版本。規則更新新增版本，不原地覆蓋稽核證據。

**核對：** 客戶端不得直接寫入任何 verified 狀態。`system_verified` 只能由 verification service 依版本化規則建立；`pharmacist_verified` 只能由授權藥師角色建立。照護者、前端或任意 API payload 傳入同名字串都必須被拒絕。每個 decision 必須引用完整 evidence_ids、rule_version 與 verification_scope。

**任務：** owner＋route＋idempotency_key 唯一；同鍵不同請求內容回 409。案件固定 model_version、catalog_version、verification_rule_version、rule_bundle_version，不在途中切換。內部 hypothesis 只能被 verification service 使用；不得直接轉成 medication_entry。

**時間：** 伺服器時間存 UTC；國家、顯示語言與時區分開。刪除保留計畫與實際清除結果都可稽核，不以 soft delete 冒充實體檔案已刪除。

**提醒：** `local_time` 使用固定 `HH:mm`，另存 IANA timezone；不得把 `08:00` 直接當 UTC。單一藥品的提醒集合每次以 transaction 原子取代，先驗證全部時間後才寫入，避免只更新一半。預設上限建議每藥 12 個時間、每帳號 100 個啟用提醒，超過回明確 422 code；實際值應可配置。

**數量：** API 以十進位字串傳送 `amount`，資料庫使用 decimal/numeric，不使用 IEEE-754 浮點累積。`unit` 使用穩定 enum，顯示文字由 locale resource 決定。

**並行更新：** medication entry 與 dose record 均有遞增 `version`。PATCH、archive、unarchive、delete 必須帶 `If-Match` 或 body version；版本不符回 409 並附目前版本，不做 last-write-wins。


<!-- PAGE -->
# 11｜整體架構與部署邊界

```text
R60+ 實體手機
  │ 按鍵、平台支援的檔案／音訊能力
  ▼
CloudMosa 遠端 Chromium
  │ 執行 React / Vite Web Widget
  │ HTTPS
  ▼
Fastify Widget Backend / BFF  ← 照護者手機網頁／管理後台
  │
  ├─ Session、Media、Verification Case、藥單與衛教 API
  ├─ Verification Orchestrator：證據狀態、硬性 Gate、矛盾阻斷
  ├─ LLM Gateway：僅允許已核對產品的受控問答／內容流程（若啟用）
  ├─ PostgreSQL + pgvector：產品、案件、證據、決策、參考向量
  └─ 私有物件儲存：短期影像、來源快照、經審查音檔
        │ 內網／受控服務身分
        ▼
Python GPU Inference Server
  ├─ 影像品質檢查／裁切
  ├─ DINOv2 embedding／內部 Top-K
  ├─ OCR／特徵抽取（選配）
  └─ 回傳 hypotheses + observations，不回傳「已確認」
```

Cloud Phone 的網頁在 CloudMosa 伺服器執行，手機接收平台的向量繪製指令；它不是普通 Android 手機本機跑 React。Web 請求來源可能是 CloudMosa 機房 IP，而非終端使用者 IP。[S04]

## 11.1 責任邊界

**React / Vite 前端：** 只負責操作、拍攝／選圖、證據引導、結果與衛教呈現。沒有權限指定最終 product_id 或 verified 狀態。

**Fastify Backend / BFF：** 是對外唯一可信 API 邊界；驗證 session、owner、CSRF、冪等、檔案用途與案件狀態。它呼叫 Python inference 取得內部 hypotheses，再由 verification orchestrator 依 catalog、evidence、rule version 產生對外決策。

**Python GPU Server：** 只做可測量的影像推論與特徵抽取，不直接寫藥單、不發布衛教、不自行決定「可服用」。服務僅允許 Fastify 後端透過內網／服務認證呼叫，避免模型端點暴露公網。

**LLM：** 若保留，應由 Fastify 後端呼叫；只在產品已完成適當核對、且有受控來源上下文時回答一般藥品資訊。LLM 不負責藥品身分確認，也不能覆寫 verification decision。

## 11.2 技術選型與取捨

前端 React／TypeScript／Vite；對外 API 使用 Node.js＋Fastify；GPU inference 使用 Python＋PyTorch＋DINOv2；資料庫 PostgreSQL＋pgvector；圖片與音訊用私有物件儲存。OpenAPI／JSON Schema 作為 Fastify 與前端／Python 之間的契約，鎖定依賴版本與模型權重雜湊。[S11][S12]

先做「模組化 Fastify 後端＋獨立 Python GPU 服務」，不先做 Kubernetes 或多個微服務。案件／工作狀態必須持久化；Python server 掛掉時可以重試推論，但不能因重試而改變既有核對結果或重複建立藥單。

## 11.3 開發、展示與正式環境

開發可沿用 WSL2、Python 與現有 GPU 先測凍結模型推論及記憶體，再決定批次大小；本規格未測得實際效能。開發機不是正式醫療服務環境。

展示必須提供 Cloud Phone 可連的公開 HTTPS Fastify 入口；雲端瀏覽器無法直接使用你電腦的 localhost。資料庫、物件儲存管理介面與 Python GPU server 不直接裸露公網。若使用展示用 HTTPS 通道，需限制管理路由並測試連線中斷。

正式環境再加入備份、復原演練、內容值班、可用性目標與區域／供應商合約。成本以推論資源、儲存／流量、內容審查／更新、維運與外部服務估算。


<!-- PAGE -->
# 12｜API 共通契約、上傳與任務建立

## 12.1 共通要求

API 前綴 `/v1`；公開讀取只回已發布產品與內容。個人資源需要工作階段或帳號授權。瀏覽器 session 建議 Secure＋HttpOnly cookie；狀態變更驗證 CSRF 與 Origin，不把 access token 長期存 localStorage。

JSON 使用 UTF-8；時間為 ISO 8601 UTC；ID 為不透明字串。錯誤格式統一為 `{error: {code, message_key, retryable, request_id}}`，一般使用者不收到內部堆疊、向量、內部 hypotheses 或伺服器路徑。

| Method／Path | 用途與必要欄位 | 回應 |
|---|---|---|
| POST /sessions | country_code、locale、client_capabilities | 201；session_id、expires_at、limits、可用功能 |
| GET /catalog/search | country_code、q 或 lookup_code、cursor | 200；公開產品摘要；僅供查資料，不建立實體藥身分 |
| POST /media | multipart file、purpose=`pill_front/pill_back/label/package` | 201；media_id、尺寸、expires_at；不回永久公開 URL |
| POST /verification-cases | country_code、初始 evidence_ids；Idempotency-Key | 202；case_id、status、poll_after_ms |
| POST /verification-cases/{id}/evidence | 新增 evidence_id／evidence metadata | 202；重新進入 evaluating |
| GET /verification-cases/{id} | 僅案件擁有人或獲授權照護者 | 200；對外狀態、下一項證據要求或單一核對結果 |
| POST /verification-cases/{id}/cancel | 取消尚可取消案件 | 200；實際狀態 |
| DELETE /media/{id} | 刪除自有暫存檔案 | 202；清除請求 ID；結果可追蹤 |

內部 Fastify → Python GPU API 可另用 `/internal/inference/*` 或 gRPC；必須服務認證，不可讓瀏覽器直接存取。其回應可包含 Top-K、distance 與 observations，但這些欄位不得原樣轉送一般使用者。

## 12.2 上傳限制（初始建議）

每張檔案上限 5 MB，MVP 接受 JPEG／PNG，解碼像素上限 20 MP；藥品正反面與標籤／包裝按用途分開。拒絕未支援格式，不只看副檔名。照護端 HEIC 若不支援，需提示轉檔或加入受控轉檔流程。

後端重新編碼、移除 EXIF、限制解碼資源；影像不得放在可猜測的公開路徑。圖片壓縮以能辨讀刻印為前提。若上傳藥袋／包裝，需提示避免包含非必要姓名、地址或識別碼。

## 12.3 案件建立範例

```json
{
  "country_code": "TW",
  "evidence_ids": ["media_front_01", "media_back_01"]
}
```

API 必須確認 media 屬於請求主體、用途正確、未過期且已成功解碼，才能建立案件。前端不能傳 `verified`、不能指定最終 `product_id`、不能自行選 model_version 或 verification_rule_version。

重送相同冪等鍵與相同 payload 回原案件；不同 payload 回 409。新增證據會建立新的 evaluation revision；若既有 verified 結果所依賴證據被替換或失效，必須重新評估，不能沿用舊決策。

## 12.4 前端候選頁的串接決策

後端不提供 `/catalog-queries`、candidate token 或公開影像候選 response。現有前端的翻卡頁在串接時必須改為讀取 `/verification-cases/{id}`，並只呈現以下狀態：

| 狀態 | 前端呈現 | 允許的下一步 |
|---|---|---|
| `collecting_evidence`／`needs_evidence` | 說明缺少哪一項證據，不顯示藥名候選 | 上傳指定的正面、背面、標籤或包裝證據 |
| `evaluating` | 核對中，不顯示假進度或候選卡 | 依 `poll_after_ms` 查詢，允許取消 |
| `verified` | 顯示唯一產品、規格、核對範圍與證據摘要 | 由 decision 建立個人藥品，再設定每日使用與提醒 |
| `unable_to_verify`／`conflict` | 顯示原因、求助與手動建立入口 | 可建立 `unverified_user_entered` 項目，但不能沿用內部 hypothesis |
| `failed`／`expired`／`canceled` | 顯示穩定錯誤文案 | 重試、重新建立案件或返回首頁 |

人工輸入名稱只能作為使用者自己的 `display_name`，或日後另行規劃的公開產品文字搜尋；本輪不能把名稱查詢、模型 Top-1 或使用者選擇轉換成 verified decision。候選卡的圖片、學名、主作用、副作用及適應症皆不屬於此後端開發需求。

## 12.5 Session feature 與 locale 契約

`POST /sessions` 至少回：

```json
{
  "session_id": "ses_01",
  "expires_at": "2026-09-20T00:00:00Z",
  "country_code": "TW",
  "locale": "zh-TW",
  "timezone": "Asia/Taipei",
  "durability": "session_only",
  "features": {
    "image_upload": true,
    "verification_first": true,
    "manual_entry": true,
    "audio_play": true,
    "medication_archive": true,
    "dose_history": true
  },
  "limits": {
    "max_upload_bytes": 5242880,
    "max_active_reminders_per_entry": 12
  }
}
```

API 文字使用 `locale`，使用者自行輸入的名稱與用法保持原文，不做機器翻譯。若 locale 不支援，回 session 實際採用的 fallback locale，不讓前端自行猜。帳號與跨 session 持久化等實際串接時再調整；在此之前 `durability=session_only` 必須如實回傳，不能暗示資料已永久保存。


<!-- PAGE -->
# 13｜核對結果與證據 API

## 13.1 一般使用者可見結果

**需要補證據：**

```json
{
  "case_id": "ver_01",
  "status": "needs_evidence",
  "reason_code": "IMPRINT_NOT_LEGIBLE",
  "next_required_evidence": {
    "type": "pill_back",
    "instruction_key": "retake_back_show_imprint"
  },
  "verification_revision": 2
}
```

此回應沒有候選藥名、排名或百分比。

**核對通過：**

```json
{
  "case_id": "ver_01",
  "status": "verified",
  "product": {
    "product_id": "product_example_01",
    "display_name": "來源中的完整品名與規格",
    "manufacturer": "來源中的製造商",
    "dosage_form": "來源中的劑型"
  },
  "verification_scope": "physical_pill_to_label",
  "evidence_summary": ["pill_front", "pill_back", "package_label"],
  "decision_version": "verify_rules_tw_v2",
  "catalog_version": "tw_demo_v2",
  "disclaimer_key": "identity_not_chemical_authentication"
}
```

只要不能排除另一合理產品／規格，或證據鏈不符合該 scope，就不能回這個結果。

## 13.2 內部推論 API

Fastify 呼叫 Python GPU server 時可取得：

```json
{
  "observations": {
    "shape": "round",
    "imprint_front": "AB?",
    "imprint_back": null,
    "quality_flags": []
  },
  "hypotheses": [
    {"product_id": "p1", "rank": 1, "score": 0.83},
    {"product_id": "p2", "rank": 2, "score": 0.81}
  ],
  "model_version": "encoder_v1"
}
```

這是機器內部資料。`score` 不宣稱是正確機率；Fastify verification orchestrator 必須再和 evidence、catalog 與 rule version 核對，不能直接將 p1 回給前端。

## 13.3 藥師人工核對

`POST /admin/verification-cases/{id}/review` 僅供授權藥師，必須包含 decision、evidence_ids 與核對依據。後端從登入身份取得 reviewer_id，不接受用戶傳入「我是藥師」。人工核對不能無痕改寫原自動結果；應新增 decision revision，保留前後版本與理由。

## 13.4 原因碼與人類可理解的下一步

| reason_code | 使用者文案方向 | 下一步 |
|---|---|---|
| IMAGE_BLURRY | 這張照片太模糊，刻印看不清楚 | 重拍指定視角 |
| GLARE_OBSCURES_IMPRINT | 反光遮住了文字／刻印 | 換角度或光線補拍 |
| MISSING_OTHER_SIDE | 還缺同一顆藥的另一面 | 補拍 front／back |
| MULTIPLE_OBJECTS | 目前一次只能核對一顆 | 重新拍攝單顆 |
| OUT_OF_CATALOG | 目前支援資料中無法可靠核對 | 查原包裝／請藥師協助 |
| AMBIGUOUS_LOOKALIKE | 僅靠目前外觀仍無法排除相似產品 | 提供標籤／包裝／調劑資料 |
| SPEC_NOT_VERIFIED | 含量、劑型或釋放型式仍未確認 | 補拍清楚的規格標示 |
| EVIDENCE_CONFLICT | 影像、標籤或紀錄之間不一致 | 停止自動核對，轉人工／藥師 |
| EVIDENCE_EXPIRED | 本次核對需要的證據已清除／失效 | 重新取得必要證據 |

業務上的無法確認使用明確狀態與 reason code，不混成 500。不要對使用者說「低於 0.8」；要說不足在哪裡、下一步可以做什麼。


<!-- PAGE -->
# 14｜衛教、藥單與照護 API

## 14.1 查詢與狀態變更

| Method／Path | 契約與安全限制 |
|---|---|
| GET /products/{id} | 回完整品名、規格、國家、產品狀態、資料來源；不是實體藥驗證 |
| GET /products/{id}/education | locale、可選 activity；固定回一般資訊模式、發布規則與覆蓋狀態 |
| GET /medication-entries | 需帳號／受控照護授權；以 `status=active/archived` 過濾並保留 verification_status，不混成同等可信 |
| POST /medication-entries/from-verification | 接受 verification_case_id；後端只允許可建立藥單的 decision，客戶端不可直接指定 product_id＋verified |
| PATCH /medication-entries/{id} | 以版本條件更新 `user_directions/default_amount/dose_unit` 白名單欄位；衝突回 409 |
| GET /medication-summary | 僅彙整符合門檻的現有一般衛教，返回未評估清單；不做藥藥交互作用判定 |
| GET /audio-assets/{id} | 依規則發布狀態與權限提供短效存取；文字版本與音檔版本一致 |
| POST /feedback | type、target_id、選用文字；禁止直接當成正確標籤更新模型 |
| POST /pairings | 建立一次性碼、有效期限、requested_scopes |
| POST /pairings/claim | 照護者提交碼；需 R60+ 主體再確認後才授權 |
| POST /pairings/{id}/approve | 手機端核對照護者身份與範圍；不可由 claim 端自行批准 |
| DELETE /caregiver-links/{id} | 立即撤銷後續權限並稽核；不宣稱可收回對方已另行保存的資料 |

## 14.2 衛教回應示例

```json
{
  "product_id": "product_example_01",
  "mode": "general_product_information",
  "coverage": "partial",
  "not_evaluated": ["drug_drug_interactions", "personal_dose"],
  "cards": [{
    "rule_id": "rule_example_01",
    "rule_version": 2,
    "category": "activity_precaution",
    "severity": "caution",
    "plain_text": "由審查流程發布的文字，不由模型即時補寫",
    "source_id": "source_example_01",
    "review_status": "published",
    "audio_asset_id": "audio_example_02"
  }]
}
```

coverage 表示本系統目前整理的範圍，不是宣稱列出全部可能風險。對「核對某顆實體藥」的流程，education endpoint 必須驗證其 verification decision 是否允許此產品／規格；不能僅因前端傳入 product_id 就解鎖內容。活動選項只能排序相符卡片，不得將未查到規則轉成「你今天可以放心開車」。

個人藥單接口都使用相同的資源歸屬驗證；一般公開產品資訊可不登入，但不能因此將個人查詢紀錄、配對碼或藥袋照片公開。

## 14.3 個人藥品 API（對齊目前前端）

`owner_id` 必須由驗證後的 account／profile 或受控 demo principal 解析，不能接受 body 自填。匿名 session 若允許建立 entry，API 必須在 session response 清楚回 `durability=session_only` 與到期時間；需要跨裝置、長期提醒或歷史紀錄時必須綁定可復原身份。不得讓前端 `localStorage` 中的陣列覆蓋伺服器藥單。

本節 CRUD 是供後端估工與 OpenAPI 設計的暫定契約；實際路徑、同步／非同步刪除與帳號持久化方式，依 API 串接時的後端實作再共同調整。已確定且不得改變的語意是：手動輸入不會變成 verified、封存保留歷史、刪除後過去 dose record 仍需有可解釋的藥品快照。

### Endpoint 一覽

| Method／Path | 用途 | 關鍵要求 |
|---|---|---|
| GET `/medication-entries?status=active` | 我的藥品主清單 | 預設只回 active；支援 cursor；排序穩定；不回 deletion_pending |
| GET `/medication-entries?status=archived` | 已封存清單 | 只回 owner 的 archived；封存項目不產生未來提醒 |
| GET `/medication-entries/{entry_id}` | 個別藥品詳情 | 回用法、提醒、來源、核對狀態、管理狀態與 version |
| POST `/medication-entries/manual` | 直接手動儲存 | name 必填、directions 選填；不得觸發辨識或產品候選 query；需 Idempotency-Key |
| POST `/medication-entries/from-verification` | 由 verification decision 建立已核對項目 | 只接受 owner 的允許 decision；後端決定 product 與 verification_status |
| PATCH `/medication-entries/{entry_id}` | 修改用法、預設數量、單位 | 白名單欄位＋version／If-Match；不能改 owner、product_id、verification_status |
| PUT `/medication-entries/{entry_id}/reminders` | 原子取代該藥提醒集合 | body 為完整 `reminder_times`；全驗證後 transaction 寫入；空陣列代表關閉提醒 |
| POST `/medication-entries/{entry_id}/archive` | 封存 | 冪等；停用未來 occurrence；不刪歷史、不代表醫囑停藥 |
| POST `/medication-entries/{entry_id}/unarchive` | 取消封存 | 冪等；只從恢復後產生未來 occurrence，不回填封存期間漏掉的提醒 |
| DELETE `/medication-entries/{entry_id}` | 刪除 | 需版本條件；202 deletion job；立即從一般清單隱藏並停止未來提醒；既有 dose history 保留最小顯示快照 |
| GET `/medication-reminder-options` | 取得可重用提醒時間 | 回所有 active entry 使用到的時間聯集；不含 archived／deleted；前端在最後加第 n+1「其他時間」 |

### 直接手動儲存

```http
POST /v1/medication-entries/manual
Idempotency-Key: 01J-MANUAL-ENTRY-001
If-Match: 不適用於 create
```

```json
{
  "display_name": "白色藥丸",
  "user_directions": "晚餐後服用",
  "schedule_type": "unknown",
  "reminder_times": [],
  "source_context": "verification_manual_fallback",
  "locale": "zh-TW",
  "timezone": "Asia/Taipei"
}
```

驗證規則：`display_name` trim 後 1–120 字；`user_directions` 0–500 字；不可包含 HTML 語意；資料庫保存 Unicode 原文。`source_context` 只記錄前端來源，不提升可信度。Response 201：

```json
{
  "entry": {
    "entry_id": "med_01",
    "product_id": null,
    "display_name": "白色藥丸",
    "strength_text": null,
    "user_directions": "晚餐後服用",
    "schedule_type": "unknown",
    "reminder_times": [],
    "default_amount": "1",
    "dose_unit": "pill",
    "source_type": "manual_direct",
    "verification_status": "unverified_user_entered",
    "active_status": "active",
    "version": 1,
    "created_at": "2026-09-19T12:00:00Z",
    "updated_at": "2026-09-19T12:00:00Z"
  }
}
```

這個 endpoint 對應「核對流程無法完成／使用者改用手動輸入」或「新增藥品 → 手動輸入」；成功後直接進完成頁，不再建立辨識案件或產品查詢。若 request 因網路重送，Idempotency-Key 必須回同一 `entry_id`。

### 由已核對案件建立個人藥品

```json
{
  "verification_case_id": "ver_01",
  "user_directions": "晚餐後服用",
  "schedule_type": "daily",
  "reminder_times": ["08:00", "20:00"],
  "default_amount": "1",
  "dose_unit": "pill",
  "timezone": "Asia/Taipei"
}
```

後端檢查案件屬於同一 owner、最新 decision 為 `verified`、decision 尚未撤回或失效，並以 decision 內的產品、規格、核對範圍與版本建立 entry。產品名稱、規格、產品 ID 與核對狀態一律由伺服器取得，不接受客戶端重送或覆寫。相同案件與 Idempotency-Key 重送必須回同一個 entry。

### 個人藥品表示

```json
{
  "entry_id": "med_01",
  "product_id": "product_amlodipine_5",
  "display_name": "脈優錠 5 毫克",
  "strength_text": "5 mg",
  "user_directions": "晚餐後服用",
  "schedule_type": "daily",
  "reminder_times": ["08:00", "20:00"],
  "default_amount": "1",
  "dose_unit": "pill",
  "source_type": "verified_case",
  "verification_status": "system_verified",
  "active_status": "active",
  "archived_at": null,
  "version": 4,
  "created_at": "2026-09-19T12:00:00Z",
  "updated_at": "2026-09-19T12:30:00Z"
}
```

前端清單的「每日 1 次／每日 2 次」可由 `reminder_times.length` 產生 locale 文案；API 不應只回不可運算的 `schedule_summary`。若未來支援每週／按需等排程，需新增結構化 `schedule`，不能用字串硬解析。

### 更新用法

```http
PATCH /v1/medication-entries/med_01
If-Match: "4"
Content-Type: application/merge-patch+json
```

```json
{
  "user_directions": "早餐後服用"
}
```

成功回 200、完整 entry 與新 `version=5`。空字串表示使用者清除用法；`null` 是否等價空字串需全系統統一，本規格建議 response 正規化成 `""`。不得把使用者修改同步覆寫到產品官方 education content。

### 取代提醒時間

```http
PUT /v1/medication-entries/med_01/reminders
If-Match: "5"
```

```json
{
  "schedule_type": "daily",
  "reminder_times": ["07:30", "12:00", "21:15"],
  "timezone": "Asia/Taipei"
}
```

時間必須是零補齊 24 小時 `HH:mm`；後端去重並排序。任何一筆無效時整包 422，不得部分成功。非空提醒集合必須搭配 `schedule_type=daily`；`schedule_type=none` 時 reminders 必須為空。`daily` 可暫時為空，代表每日服用但尚未啟用提醒。修改後只重建未來 occurrence；已發生的 schedule／dose records 維持原 schedule version。

提醒資料與實際裝置通知能力必須分開說明。Cloud Phone 不保證背景推播／鬧鐘；MVP 後端可建立 occurrence 並在 App 開啟時回傳到期項目，但不能僅因資料庫有 `08:00` 就宣稱手機會在關閉 App 後可靠響鈴。若未來加入外部通知通道，需另存 channel、delivery status、failure reason 與使用者授權。

### 提醒時間聯集

```json
{
  "timezone": "Asia/Taipei",
  "times": [
    {"local_time": "07:30", "active_entry_count": 1},
    {"local_time": "08:00", "active_entry_count": 2},
    {"local_time": "12:00", "active_entry_count": 1},
    {"local_time": "20:00", "active_entry_count": 2}
  ],
  "generated_at": "2026-09-19T12:00:00Z"
}
```

後端只回資料庫時間；第 `n + 1` 筆「其他時間」是前端操作項目，不保存成假資料。使用者透過原生 `input type=time` 新增時間後，前端把新時間加入該藥完整集合，再呼叫 PUT。

### 封存、復原與刪除語意

- **封存：** `active_status=archived`、設定 `archived_at`、取消／不再產生未來 pending occurrence；保留 entry、用法、提醒設定與歷史紀錄，以便復原。
- **取消封存：** 回 `active`，從伺服器接受時間之後重建未來 occurrence；不把封存期間自動標成漏服。
- **刪除：** UI 必須先確認；API 立即把資源變成 `deletion_pending` 並從 GET active／archived 隱藏。既有 dose history、數量、狀態與必要的藥品顯示快照保留，使過去紀錄與每日統計仍可解釋；不保留未來提醒。實際刪除哪些 entry 欄位、如何去識別化與保留多久，等 API 串接時依後端資料模型及保留政策調整。
- **刪除 response：** 202 `{deletion_request_id, status, requested_at}`；若 demo profile 能同步完成，仍建議回 deletion receipt，方便測試與稽核。
- **重複操作：** 對已封存再 archive、對 active 再 unarchive 回目前狀態；對 deletion_pending 再 delete 回同一 deletion job，不建立多份清除工作。

## 14.4 今日服藥與歷史紀錄 API

目前前端 fixture 使用 `{id, medicineId, time, amount, unit, taken}`。正式 API 改用 occurrence／record，避免 checkbox 布林值無法描述補記、略過與更新數量。

| Method／Path | 用途 | 回應／限制 |
|---|---|---|
| GET `/dose-occurrences?local_date=YYYY-MM-DD&timezone=Asia/Taipei` | 今日服藥清單 | 回該日 occurrence、藥品快照與 record status；日期／timezone 必填或取 account profile |
| PUT `/dose-occurrences/{id}/record` | 記錄已服用／略過 | 冪等 upsert；需 Idempotency-Key；body 含 status、amount、unit、taken_at |
| PATCH `/dose-records/{id}` | 修改數量或狀態 | If-Match version；保留 revision／audit |
| GET `/dose-history?from=...&to=...&timezone=...` | 歷史日期摘要 | 每日 `taken_count/total_count`；cursor；不以 archived entry 消除歷史 |
| GET `/dose-history/{local_date}?timezone=...` | 單日明細 | 回 occurrence、entry snapshot、record、顯示時間 |

### 今日清單 response

```json
{
  "local_date": "2026-09-19",
  "timezone": "Asia/Taipei",
  "items": [
    {
      "occurrence_id": "occ_01",
      "entry_id": "med_01",
      "medicine_name": "降血壓藥",
      "scheduled_local_time": "08:00",
      "scheduled_at": "2026-09-19T00:00:00Z",
      "amount": "1",
      "unit": "pill",
      "status": "taken",
      "record_id": "dose_01",
      "taken_at": "2026-09-19T00:05:00Z",
      "version": 2
    }
  ],
  "summary": {"taken_count": 1, "total_count": 3}
}
```

### 記錄／修改 request

```json
{
  "status": "taken",
  "amount": "1",
  "unit": "pill",
  "taken_at": "2026-09-19T00:05:00Z"
}
```

前端目前用 Enter 切換 checkbox；後端不可將每次切換都當 create。相同 occurrence 的 PUT 是 upsert，重送同一 Idempotency-Key 回同一結果。若使用者取消已服用狀態，應使用明確 `status=pending`／刪除 record 的產品決策，不建議靠再次 PUT `taken=false` 猜語意；MVP 可先定義 `pending` 為清除目前紀錄並寫 audit。

數量鍵盤支援 0.5 步進與直接輸入；API 接受 decimal string，初始範圍可設 `0 < amount <= 99.5`，實際上限需產品決策。PATCH 成功回原日期明細所需資料；前端儲存後回「紀錄詳情」，不得誤導向藥品管理頁。

## 14.5 緊急資訊 API 邊界

目前前端展示過敏文字與現用藥摘要。若後端化，建議：

| Method／Path | 說明 |
|---|---|
| GET `/emergency-profile` | 回使用者自行提供的 allergy／notes、資料更新時間，以及 active medication entries 的最小摘要 |
| PATCH `/emergency-profile` | 更新使用者提供的過敏／備註；If-Match；不得由藥品模型自動推論過敏 |

Response 必須標記 `provenance=user_provided` 與 `updated_at`。此頁不是完整醫療紀錄，也不能因未填資料顯示「無過敏」。若沒有資料，回 `null/unknown` 並使用不確定文案。


<!-- PAGE -->
# 15｜後端執行、錯誤與內容後台

## 15.1 Worker 與任務狀態

`verification case: collecting_evidence → evaluating → needs_evidence / verified / conflict / unable_to_verify / failed / canceled / expired`。其下的 inference job 可使用 `queued → running → completed / failed / canceled`。案件與工作紀錄都持久化；Python 推論完成不等於 verification 完成。程序重啟後可恢復案件，不靠單一 process 記憶體保存唯一狀態。

可重試的網路或資源錯誤採有限次退避重試；壞檔、未知藥、矛盾證據不重試到「得到答案」。同一 inference job 重跑不直接寫入衛教或藥單；結果提交需檢查 lease。每次 verification evaluation 產生 revision，只有 verification service 能建立 decision；取消與完成競態時以資料庫決定唯一案件終態。

初始限制：每 session 同時 1 個核對案件進行 GPU 評估、單一 inference job 最多重試 2 次；推論超時預設 30 秒、前端整段等待 45 秒後可轉「稍後重新查詢狀態」。這是可調整的工程預設，不是平台效能保證。

| HTTP／錯誤 | 行為 |
|---|---|
| 400／422 | 欄位、國家或用途錯誤，指出可修改項目，不無限重送 |
| 401／403 | 重新認證或無權操作，不降低權限檢查來求成功 |
| 404／410 | 不存在、不可見或已過期；敏感資源避免洩漏別人的存在性 |
| 409 | 冪等鍵內容／藥單版本衝突，重新讀取後再決定 |
| 413／415 | 檔案過大／格式不支援，保留人工輸入與更換照片入口 |
| 429／503 | 依 Retry-After 顯示可重試；不重複建立任務 |

## 15.2 內容審查後台

最小畫面包含產品／外觀對照、來源原文與草稿並排、適用產品／成分／途徑／規格、生活分類、語音審聽、發布與停用按鈕、歷史版本與差異。

流程為 `draft → in_review → published → suspended / superseded`。作者可編輯草稿；藥師審查者決定醫療內容是否可發布；系統管理者可停用問題版本但不得擅自替代醫療審查。P0 可用受控簡易表單，不要求華麗 CMS。

## 15.3 上線與回復

一次發布綁定 catalogue、model、preprocess、rule bundle、audio manifest；先 staging 通過回歸，再切換版本指標。發現錯誤可單獨停用產品或卡片，也可關閉影像辨識，保留有來源的人工查詢。已撤回的音檔不可繼續由舊永久網址無限制存取。

錯誤回報只進待審查池。照護者、使用者甚至標籤 OCR 的回饋都不能直接變成 ground truth；人工核實後才納入下次資料版本。

## 15.4 前端操作的後端交易順序

### A. 「拍照／選圖 → 證據核對 → 單一結果」流程

```text
POST /media 上傳目前證據
→ POST /verification-cases (Idempotency-Key)
→ GET /verification-cases/{id} 依 poll_after_ms 查詢
→ needs_evidence：依 next_required_evidence 補上證據後重新評估
→ verified：POST /medication-entries/from-verification
→ unable_to_verify/conflict：停止自動核對，可改走 manual create
→ 建立 entry transaction 完成（只有 verified decision 可建立 system_verified）
→ 前端顯示新增完成並清除 flow history
```

建立 entry transaction 至少包含 entry、reminders、revision/audit 與 idempotency result；任一寫入失敗整筆 rollback。完成頁不能先顯示再背景補寫。

### B. 手動輸入直接儲存

`POST /medication-entries/manual` 直接建立 `unverified_user_entered`，不得自動再跑辨識或把 verification case 的內部 hypothesis 帶入 entry。若由無法核對案件轉入，可保存 nullable `origin_verification_case_id` 作稽核，但不能因此提升核對狀態。

### C. 修改提醒

```text
GET /medication-reminder-options
→ 前端顯示時間聯集 + n+1 Other
→ 使用者可新增一個 HH:mm 到本地選擇集合
→ PUT /medication-entries/{id}/reminders (完整集合, If-Match)
→ transaction: validate all → replace reminders → bump entry version
  → cancel/rebuild future occurrences → audit
→ 回完整 entry
```

若 occurrence 重建 worker 採非同步，API response 需回 `schedule_sync_status=pending/ready/failed`；在 pending 期間 GET today 不可同時回新舊重複 occurrence。可使用 schedule generation version 與 transaction/outbox 保證切換。

### D. 封存／取消封存／刪除

- archive／unarchive 更新 entry 與 schedule generation、寫 audit，成功後前端回主藥品清單。
- delete 先在同一 transaction 設 deletion_pending、停止新 schedule、建立 deletion job/outbox；worker 再依保留政策清除。立即 202 不代表備份與物件儲存已清除完成。
- 任何操作若 version 過期回 409；前端重新 GET 詳情，不能自動覆蓋別的裝置剛做的修改。

### E. 完成頁與 Back

前端完成頁不需要 API resource。後端只需確保 mutation 已 commit、response 可安全重放；前端收到 2xx 才進完成頁。由於前端完成後把瀏覽歷史壓回 Home，再次進入功能時應重新 GET server state，不依賴上一個 React state。

## 15.5 新增錯誤碼

錯誤仍使用第 12.1 節 envelope。`message_key` 供前端 i18n，`details` 只能包含可安全顯示的欄位資訊。

| HTTP | code | retryable | 使用時機／前端行為 |
|---|---|---|---|
| 409 | `IDEMPOTENCY_PAYLOAD_MISMATCH` | false | 同 key 不同 payload；停止並記錄 request_id |
| 409 | `MEDICATION_VERSION_CONFLICT` | false | entry version 過期；重新 GET 詳情並提示資料已更新 |
| 409 | `VERIFICATION_NOT_VERIFIED` | false | 嘗試由 needs_evidence／conflict／unable 案件建立已核對藥品；回案件狀態頁 |
| 410 | `VERIFICATION_DECISION_EXPIRED` | false | 已核對 decision 已失效或被撤回；重新蒐集證據 |
| 422 | `INVALID_REMINDER_TIME` | false | 非 `HH:mm` 或超出 00:00–23:59；保留編輯值並聚焦錯誤欄位 |
| 422 | `TOO_MANY_REMINDERS` | false | 超過 session limit；說明上限 |
| 422 | `INVALID_DOSE_AMOUNT` | false | amount 格式／範圍錯誤；保留數量編輯頁 |
| 409 | `ENTRY_ARCHIVED` | false | archived entry 不可新增未來 dose；可先 unarchive |
| 409 | `ENTRY_DELETION_PENDING` | false | 刪除中的資源不可更新；返回藥品清單 |
| 404 | `OCCURRENCE_NOT_FOUND` | false | occurrence 不屬於該 owner／日期或不可見；避免洩漏他人資源 |
| 409 | `DOSE_RECORD_VERSION_CONFLICT` | false | 另一裝置已修改；重新讀取當日明細 |
| 503 | `SCHEDULE_SYNC_PENDING` | true | schedule 正在切換且無法給一致快照；依 Retry-After 重讀 |

## 15.6 OpenAPI 與型別交付物

後端合併前必須交付並在 CI 驗證：

1. `/v1` OpenAPI 3.1 文件，包含所有 request／response／error schema 與 examples。
2. 從 OpenAPI 產生或驗證的前端 TypeScript types；不得由前後端各自手寫同名 enum。
3. JSON Schema contract tests：verification create／evidence／result、manual create、verified entry create、entry patch、reminder replace、archive、delete、today doses、history。
4. 狀態機測試：verification case、entry active status、deletion job、dose record。
5. 權限測試：其他 owner 的 verification case、entry、occurrence、media 一律不可讀寫。
6. Idempotency tests：同 key 同 payload 回同資源；同 key 異 payload 回 409；網路逾時重送不產生重複 entry／record。


<!-- PAGE -->
# 16｜隱私、安全與風險處理

## 16.1 最小蒐集與保留（本案建議）

P0 不要求生日、住址、完整病史或電話；只為查詢選國家與語言。藥袋常含個人資訊，拍攝引導提示避免拍到姓名／識別資訊；若必須供核對使用，另說明用途與授權。裁切／遮罩前的原圖也要納入保留政策。

自有伺服器的原始上傳預設 24 小時內清除；中間裁切圖與個人向量同時清除，除非另有明確同意及合法目的。工作技術紀錄建議保留 30 天且不含原圖或藥名；藥單依使用者保存與刪除決定。正式保留期限與必要稽核／備份清除時程另經合規確認。

刪除承諾只涵蓋本團隊控制的儲存；不能宣稱同時刪掉手機相簿原檔、照護者另存副本或未確認的 CloudMosa 紀錄。Cloud Phone 是第三方雲端執行環境，需確認資料處理、區域、留存與合約；HTTPS 不等於中介平台看不到應用處理中的資料。[S04][S05]

## 16.2 核心防護

所有個人資料端點驗證 owner／授權 scope；物件儲存私有，短效網址與服務端權限檢查；管理者多因素登入。限制請求、上傳與推論資源；瀏覽器輸入與標籤文字當不可信資料，不直接執行 HTML、SQL 或模型指令。

使用參數化查詢、輸出編碼、CSP、依賴鎖版與秘密管理；不在前端放模型服務或 TTS 金鑰。外部圖片下載採白名單與重新導向限制，防止 SSRF。照片解碼限制資源，防止壓縮炸彈。

因 API 可能看到共享的 CloudMosa 出口 IP，限流應結合 session、帳號與工作配額，不只依 IP；不得用該 IP 推斷用戶所在國家。[S04]

## 16.3 配對與共用手機

建議配對碼為一次性 8 位數、5 分鐘有效，服務端只存雜湊；限制碼與 session 的嘗試次數、全域風險速率。短碼本身不足以授權，必須有手機端確認照護者身份與範圍；驗證完成即失效。正式版應再依威脅模型調整。

共用手機提供明確切換使用者與登出；個人頁面重入需適當解鎖，不能憑一個永不過期 cookie 永久暴露藥單。配對碼／產品查詢碼／帳號復原碼不能共用。清除 Cloud Phone 資料可能失去登入憑證，持久藥單需另有安全復原流程。[S05]

**訓練使用：** 預設不將使用者照片納入訓練。另行同意需與服務使用分開；拒絕提供訓練資料不影響查詢。產品分析不記錄原始藥名、藥袋 OCR 全文或敏感網址參數。


<!-- PAGE -->
# 17｜非功能需求與可觀測性

以下都是待驗證目標，需在報告中附設備、資料量、網路、併發、模型版本與測試時間。不可拿桌面測試結果當 R60+ 全流程效能。

| 項目 | 初始目標／約束 | 測量方法 |
|---|---|---|
| API 查詢延遲 | 已暖機的一般查詢 P95 < 500 ms | 後端計時；不含手機到平台延遲 |
| 模型處理延遲 | 單張、低併發 P95 < 3 秒 | 指定 worker、輸入尺寸、warm/cold 分開 |
| 端到端查詢 | 穩定測試網路下 P90 < 15 秒 | 從手機確認送出至可讀結果；包括實際上傳 |
| 資料量 | 一般使用者只載目前證據要求或單一核對結果 | 內部 hypotheses 不送到前端；縮圖／音檔按需讀取 |
| 鍵盤可用性 | 所有 P0 操作可只用實體按鍵 | 實機逐項任務測試；輸入模式無快捷鍵衝突 |
| 內容完整性 | 所有發布卡均可追溯來源與版本 | 自動驗證＋審查清單；缺欄位阻止發布 |
| 音訊一致性 | 所有發布音檔對應相同文字版本 | 雜湊檢查、人工審聽、標準／慢速各測 |
| 安全退路 | 任何模型或來源故障仍不輸出確定用藥結論 | 故障注入與危險輸入回歸測試 |
| 可復原性 | 任務、版本、刪除請求可追蹤 | worker 中斷、重啟、重送、撤回演練 |

## 17.1 監測哪些事件

記錄 `session_started、input_selected、upload_failed、verification_needs_evidence、evidence_added、verification_conflict、verification_verified、verification_unable、audio_failed、education_opened、list_opened`；只記匿名／去識別化的技術屬性與必要版本，不把完整藥單打進一般分析平台。

每次決策能回溯 request_id、模型、catalog、verification rule、內容 rule bundle、evidence_ids、原因碼與處理時長。模型 Top-K 指標只做工程分析；產品安全指標以錯誤確認率、未知／矛盾誤放行率、核對覆蓋率與補證據完成率為主。

## 17.2 網路與流量的特殊性

API 的傳輸量是 CloudMosa 到自有後端這一段，不能直接當成使用者手機實際資費流量。手機到平台的網路、渲染與音訊另外量測；兩段資料在報告中分開。[S04]

前端可以快取非敏感版本資料以改善重開體驗，但這是雲端瀏覽器儲存，不是離線承諾。音檔預載需有上限，不為了縮短一鍵朗讀延遲而自動下載全部藥品音訊。[S05][S06]

## 17.3 未指定的正式服務目標

黑客松先驗證閉環，不填沒有容量規劃支持的 99.99% SLA。正式版再依使用者量、風險與合作機構需求定義可用性、RTO／RPO、告警值班、備援區域與供應商退出方案。


<!-- PAGE -->
# 18｜驗證、測試與發布閘門

## 18.1 測試資料切分

參考圖庫與測試照片分開；不要把同一官方圖片做旋轉／裁切後同時放進訓練與測試。以實體藥、批次、拍攝人、拍攝場次和來源分組切分。「已收錄產品的不同實拍」「未收錄產品」「相似外觀但不同規格」「故意錯配標籤」必須是不同測試族群。

初始可行性驗證建議：20 個品項各至少 10 次獨立查詢，涵蓋不同實體樣本／光線／背景；另設至少 100 次未收錄、易混淆、錯配證據與非藥品輸入。此規模只適合黑客松可行性測試，不足以證明臨床安全。

## 18.2 必報指標：以「錯誤確認」為中心

| 指標 | 定義／用途 |
|---|---|
| Wrong Verification Rate | 被標成 verified 但產品／規格其實錯誤 ÷ 所有 verified 案件。必須列出分母與測試情境 |
| Verification Coverage | 能在既定證據流程下完成 verified 的案件 ÷ 所有提交案件；不能單獨追求越高越好 |
| Unknown False-Verify Rate | 未收錄／非藥／不在支援條件的輸入，被錯誤標成 verified 的比例 |
| Conflict False-Pass Rate | 故意矛盾的影像／標籤／規格，被系統錯誤放行的比例 |
| Evidence Completion Rate | 系統要求補證據後，測試者能成功完成流程的比例 |
| Evidence Steps to Decision | 從開始到 verified／unable 平均與分位數需要幾次補證據 |
| Internal Top-1／Top-K Recall | 僅用於評估影像檢索是否能把真值送進 verification engine；不作為對外安全結論 |
| End-to-End Latency | 從送出到下一個可操作狀態／最終決策的時間 |

不得把「Top-3 ≥ 90%」當成本產品確認安全門檻。模型指標仍可作工程 KPI，但發布判斷必須以完整 pipeline 在獨立測試資料上的 wrong verification、unknown false-verify 與 conflict false-pass 為核心。任何自動確認 Gate 的數值閾值都要在開發／校準集決定並凍結，再到測試集一次評估，不能看完測試結果後反覆調門檻。

## 18.3 必須通過的安全案例

| 測試 | 預期結果 |
|---|---|
| 外觀相同、不同含量／不同成分 | 不顯示候選；要求能區分規格的證據，否則 unable_to_verify |
| 兩張照片來自不同藥品 | 產生衝突或一致性失敗；禁止 verified |
| 正確藥丸＋錯誤藥袋 | EVIDENCE_CONFLICT；模型高分不得覆蓋 |
| 模糊刻印但模型非常相似 | 要求補拍；不能因 score 高而通過 |
| 未知藥、破碎藥、糖果或混合藥 | unable_to_verify／重拍，不硬選第一名 |
| 只有包裝照片、沒有實體藥關聯 | 最多 package_label_only，不得宣稱 physical_pill_to_label |
| 未選國家、資料包不支援 | 要求選擇／告知資料不足，不套台灣結果到別國 |
| 前端偽造 verified／product_id | 後端忽略或拒絕；不能提升案件狀態 |
| 無飲食資料、審查過期、來源撤回 | 明示不足／待更新，不輸出「無禁忌」 |
| 別人的 media_id、配對碼暴力猜測 | 拒絕並限制速率，沒有個資洩漏 |
| 重複送出、斷線、Python server 重啟 | 可恢復同一案件，不重複建立藥單或 decision |
| 舊音檔對應新警語 | 阻止發布或播放錯版內容 |

## 18.4 人因測試與發布 Gate

邀請 5–8 位接近目標條件的測試者，以示範資料完成「拍照 → 按指示補證據 → 看懂核對狀態 → 開啟衛教 → 重播」。請他們用自己的話回答：「系統現在是已核對、還缺資料，還是不能確認？」以及「已核對代表什麼、不代表什麼？」記錄需要協助的步驟，而非只問好不好用。

發布順序：Gate 0 真機能力 → Gate 1 資料／授權完整 → Gate 2 模型基準 → Gate 3 verification rules／矛盾測試 → Gate 4 內容與音檔專業審查 → Gate 5 整合安全與人因 → Gate 6 受控展示。通過黑客松展示不等於可供真實病患自助決策。

## 18.5 前端對齊 API 驗收案例

| 案例 | 操作 | 必要 API 斷言 |
|---|---|---|
| 證據不足 | 上傳正面但缺少背面／標籤 | 回 `needs_evidence` 與一個具體 next step；response 不含候選、排名或分數 |
| 核對通過 | 補齊必要證據且所有硬性 Gate 一致 | 回單一 `verified` 產品、規格、scope、decision version；不回 Top-K |
| 無法排除相似品 | 證據仍不足以唯一核對 | 回 `unable_to_verify`；不得建立 `system_verified` entry |
| 手動直接新增 | 使用者輸入 name＋directions | 只呼叫 manual create；不觸發辨識／候選 query；回 `unverified_user_entered` |
| 已核對項目重送 | from-verification response 遺失後以同 Idempotency-Key 重送 | 回同一 entry_id，不產生重複藥品 |
| 用法修改 | active 或 archived、自建或已核對藥品修改 directions | 只更新 `user_directions`、version +1；官方 education 不變；回藥品詳情 |
| 提醒聯集 | 三個 active 藥品使用 08:00、12:00、20:00；archived 使用 07:00 | options 只回 08:00／12:00／20:00，去重排序；前端另加 n+1 Other |
| 其他提醒時間 | 輸入 21:15 後儲存 | PUT 完整集合；回排序後集合；未來 occurrence 不重複 |
| 無效提醒 | 輸入 25:99、8pm、空白 token | 422 INVALID_REMINDER_TIME；資料庫與 schedule 不部分更新 |
| 封存 | 封存有未來提醒的 entry | 從 active 移到 archived；停止未來 pending occurrence；過去 dose history 保留 |
| 取消封存 | 將 archived entry 恢復 | 回 active；只建立恢復後未來 occurrence；封存期間不自動標漏服 |
| 刪除取消 | 刪除確認頁預設 Cancel | 不呼叫 DELETE，不改 entry |
| 刪除確認 | 確認刪除 | 202＋同一 deletion job；立即不出現在 active/archived；未來提醒停止；過去 dose history 仍可用藥品快照顯示 |
| 版本衝突 | 兩裝置用同 version 修改 directions/reminders | 第一筆成功；第二筆 409，不能覆蓋 |
| 今日記錄重送 | 同 occurrence、同 idempotency key 重送 taken | 只有一筆 dose record；summary 不重複加一 |
| 修改服藥數量 | 將 1 改成 0.5 | decimal 精確保存，version +1，audit 可回溯；歷史頁讀到新值 |
| 完成後返回 | entry／dose mutation 成功進完成頁，再按 Back | 前端回 Home；後端沒有第二次 mutation；重新進清單 GET 到已提交資料 |
| 跨使用者 | 使用別人的 verification_case_id、entry_id、occurrence_id | 404／403 且不洩漏資源是否存在 |
| locale | zh-TW 與 en-US 查相同產品；使用者輸入中文 directions | enum／ID 穩定、官方摘要依 locale、使用者 directions 保持原文不翻譯 |

整合測試至少在 240×320 與 128×160 兩種 viewport 走完；API 延遲測試需包含 verification polling、暫存 media 到期、連線中斷重送與 409 conflict。畫面測試通過不代表資料契約通過，必須同時檢查資料庫唯一鍵、audit event 與 idempotency result。


<!-- PAGE -->
# 19｜開發分工、展示腳本與風險

## 19.1 分工建議

| 工作流 | 主要交付物 | 關鍵依賴 |
|---|---|---|
| 產品／前端 | 真機測試頁、按鍵導覽、補證據頁、核對結果、衛教、語音、藥單 | Gate 0、API 契約、reason code 文案 |
| Fastify 後端／整合 | session、media、verification cases、單一核對結果、產品／個人藥品 CRUD、提醒時間聯集、dose occurrence／history、封存／刪除、授權與部署 | DB schema、OpenAPI、Python inference 契約、verification rules、前端 contract tests |
| AI／Python GPU | 影像品質、裁切、embedding、內部 hypotheses、OCR／特徵、離線評估 | 可用照片、產品對應、獨立實拍 |
| 內容／驗證 | 來源映射、核對規則、藥師審查、音檔、安全案例與簡報 | 合法來源、合作審查者 |

四條工作流不是一定要四個人；少人時可合併。最終核對規則與衛教發布不能僅由模型開發者憑感覺決定。若沒有藥師資源，展示需清楚標示為研究／原型，不能把它描述成已驗證醫療服務。

## 19.2 建議里程碑

**M0 平台決策：** 完成真機上傳／朗讀／按鍵測試，鎖定 A 或 B 影像入口。

**M1 單品項垂直切面：** 一個產品，完成 front＋back＋label → Python inference → Fastify verification → 單一結果 → 一條已審查提醒 → 音檔。

**M2 Verification MVP：** 增加 `needs_evidence / verified / conflict / unable_to_verify` 狀態、reason code、補證據 API 與規則版本；先用 3–5 個品項把安全流程做完整。

**M3 擴展資料與模型：** 擴至限定品項，建立版本化參考庫與內部檢索；優化模型只為減少補證據次數與提升 coverage，不得放寬矛盾 Gate 來追求漂亮數字。

**M4 個人藥品與紀錄：** 加入我的藥品、用法、提醒時間聯集＋第 n+1 自訂時間、封存／復原／刪除、今日 occurrence、服藥歷史與數量修改；同時完成來源、內容審查、失敗回復及需要時的照護者／藥師流程。

**M5 整合驗收：** 實機回歸、look-alike、未知、錯配標籤、低訊號、權限、重複送出與 server 重啟；最後凍結 model、catalog、verification rule、content bundle。

若黑客松時間有限，優先縮品項而不是拿掉 verification Gate。

## 19.3 展示腳本

1. 使用者拍一顆支援品項；系統先說「正在核對」，不顯示候選。
2. 故意先給一張背面刻印不清楚的照片；系統要求「補拍背面刻印」。
3. 補上清楚背面與原包裝／標籤，核對服務通過，畫面顯示單一產品、規格、核對範圍與「不是化學驗真」說明。
4. 開啟生活提醒並朗讀，例如駕駛／飲食注意事項。
5. 第二個案例用外觀很像但規格或標籤矛盾的藥，展示系統即使影像模型很有把握也會阻止確認。
6. 第二次查詢從已核對藥單直接進入衛教，不需要每天重拍。

這比「顯示 Top-3 再請使用者挑一個」更能說明本案的技術價值：**AI 找線索，verification engine 決定證據是否足夠；不確定時主動補證據，而不是把風險丟給使用者。**

## 19.4 最高風險與預案

上傳不可用 → 照護端上傳；鏡頭讀不到刻印 → 要求包裝／調劑證據或停止確認，不盲目加大模型；資料缺警語 → 減少品項；模型混淆 → 補證據／unable_to_verify；核對規則未充分驗證 → 僅原型展示，不啟用自動 verified；醫療審查缺位 → 僅研究示範；網路失效 → 清楚標示的錄影備援。


<!-- PAGE -->
# 20｜後續演進與待決策事項

## 20.1 產品演進

**下一階段：** 優化「第一次補齊證據」的流程，讓藥師／照護者協助完成高成本建檔，之後使用者能少按幾次鍵就重聽。將「已核對決策」與「尚需證據案件」長期分開；更換藥品、規格、外觀、來源或 verification rule 失效時啟動重新核對，不默認新外觀仍是舊藥。

**更多生活情境：** 以經審查來源擴增駕駛、操作機械、酒精、食物與作息相關提醒；不能根據症狀或照片自行推論「今日能安全工作」。服藥記錄與提醒是獨立功能，尤其按需用藥不能被排程誤解成一定要吃。

**新的國家：** 每個 country pack 獨立管理藥品、品牌、規格、標示來源、審查者、語言、音訊、緊急與藥師聯絡資訊及法規要求。先做一個新國家試點，不宣稱台灣模型可以辨識全球藥品。

**更高風險的功能：** 完整交互作用、劑量、症狀判讀與個人治療建議需要另立專案和風險控制，不把 MVP 規則引擎自然延伸成臨床決策系統。

## 20.2 正式推出前的治理

確認意圖用途、臨床風險、目標國醫療器材／軟體分類、個資處理、跨境傳輸、內容授權、供應商與事故處理責任。是否受醫療器材管理不能只靠「僅供參考」字樣決定；美國 FDA 的軟體政策可作比較資料，但不代替台灣或其他目標國的法律判定。[S18]

配合地區設定求助資訊；不把美國網站的電話直接複製為全球緊急聯絡方式。嚴重不適入口應提供經當地審查的求助指引，不讓使用者先等模型辨識完才能查看。

## 20.3 需要團隊決定的項目

| 決策 | 本稿採用的暫定值 | 會改變什麼 |
|---|---|---|
| 首要使用者 | 台灣資料做展示；服務按鍵手機用藥者 | 國家資料、語言、人因測試與服務通路 |
| 影像入口 | 以真機 Gate 0 決定 A／B | 是否做照護者配對；展示敘事 |
| 團隊與開發時間 | 未確定；以里程碑而非承諾工時規劃 | 能做品項量、P1 功能與驗證深度 |
| 是否有藥師參與 | 視為發布必要條件，尚未確認資源 | 可否稱正式衛教或僅研究示範 |
| 模型路線 | 凍結 DINOv2 內部檢索先做基準；不直接對外輸出候選 | GPU 使用、標註量、是否需要微調 |
| 自動核對範圍 | 先限支援品項＋完整證據；無法排除則不通過 | verification rules、需要哪些包裝／調劑證據、展示可信度 |
| 持久登入與照護關係 | 先做受控示範／必要配對 | 隱私、共用手機、帳號復原 |
| 公開展示方式 | 可連網的 HTTPS；實機測試 | 部署位置、連線與費用 |

**建議先作的產品選擇：** 先定義黑客松中「verified」要涵蓋到哪一層。若只有 R60+ 裸藥照片，應把自動核對範圍設得非常窄；若可加入原包裝／藥袋或藥師／照護者首次建檔，才能在不把風險丟給使用者的情況下降低不確定性。這個決策應優先於大量模型訓練。


<!-- PAGE -->
# 21｜參考來源與追溯（1/2）

查核日期：2026-09-19。下列為本文件引用的官方設備、平台、資料集與專案文件；它們支援相應事實，不代表本產品已取得驗證或認證。來源異動時應重新查核。

**[S01] Cloud Phone for Developers — Itel NEO R60+ 4G**
https://developer.cloudfone.com/device/itel_it9310/
用途：設備頁標示版本、螢幕與機型資訊；不保證手上設備的當前韌體。

**[S02] Cloud Phone — Get Started**
https://developer.cloudfone.com/docs/guides/get-started/
用途：Web Widget、按鍵、上傳／錄音版本門檻與不支援能力。

**[S03] Cloud Phone — Feature Detection**
https://developer.cloudfone.com/docs/reference/feature-detection/
用途：hasFeature 名稱與能力偵測；實際操作仍需例外處理與驗證。

**[S04] Cloud Phone — Architecture**
https://developer.cloudfone.com/docs/guides/architecture/
用途：遠端 Chromium、PVGL、HTTPS／WSS 與機房來源 IP。

**[S05] Cloud Phone — Data Storage**
https://developer.cloudfone.com/docs/reference/data-storage/
用途：雲端儲存、cookies、清除資料與關鍵資料保存設計。

**[S06] Cloud Phone — Multimedia**
https://developer.cloudfone.com/docs/reference/multimedia/
用途：音訊格式、播放限制、音量與慢速音檔設計。

**[S07] Cloud Phone — Design Guide**
https://developer.cloudfone.com/docs/guides/cloud-phone-design/
用途：小螢幕、軟鍵、焦點與返回導覽。

**[S08] TFDA／政府資料開放平臺 — 藥品外觀資料集**
https://data.gov.tw/dataset/9120
用途：外觀欄位、圖檔連結、資料同步與授權資訊。

**[S09] TFDA／政府資料開放平臺 — 全部藥品許可證資料集**
https://data.gov.tw/dataset/9122
用途：產品許可、狀態、製造商、劑型與產品資料。


<!-- PAGE -->
# 21｜參考來源與追溯（2/2）

**[S10] TFDA／政府資料開放平臺 — 藥品詳細處方成分資料集**
https://data.gov.tw/dataset/9121
用途：許可證關聯、成分、含量與單位；保留原文與正規化值。

**[S11] Meta / facebookresearch — DINOv2 官方專案**
https://github.com/facebookresearch/dinov2
用途：通用影像特徵模型與程式；不構成藥品辨識效能證據。

**[S12] pgvector 官方專案**
https://github.com/pgvector/pgvector
用途：PostgreSQL 向量、距離、精確與近似搜尋能力。

**[S13] FastAPI 官方文件**
https://fastapi.tiangolo.com/
用途：Python 型別 API 與 OpenAPI 契約能力。

**[S14] U.S. NLM — DailyMed Web Services**
https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm
用途：美國藥品標示 API；不是各國產品自動映射或完整交互作用引擎。

**[S15] U.S. FDA — Some Medicines and Driving Don’t Mix**
https://www.fda.gov/consumers/consumer-updates/some-medicines-and-driving-dont-mix
用途：駕駛、注意力與作用期間的醫療警語背景；實際產品仍核對仿單。

**[S16] U.S. FDA — Grapefruit Juice and Some Drugs Don’t Mix**
https://www.fda.gov/consumers/consumer-updates/grapefruit-juice-and-some-drugs-dont-mix
用途：食物交互作用有產品與個體差異，不以同一規則套用所有藥。

**[S17] MedlinePlus — Chlorpheniramine Drug Information**
https://medlineplus.gov/druginfo/meds/a682543.html
用途：檢視藥品衛教的內容與 ASHP 權利標示；未將全文複製為產品資料庫。

**[S18] U.S. FDA — Policy for Device Software Functions and Mobile Medical Applications**
https://www.fda.gov/regulatory-information/search-fda-guidance-documents/policy-device-software-functions-and-mobile-medical-applications
用途：醫療軟體監管風險的比較參考；非目標國法律意見。

本文件中的流程、資料模型、API、介面尺寸、閾值、時間與保留政策均為團隊設計提案；採納後應編號追蹤變更，並記錄決策人、理由、驗證結果與版本。
