"""ARM template 交叉引用檢查。

    python -X utf8 deploy/azure/check-template.py

點解要有:`az deployment group validate` 喺公司網跑唔到(`az account show` 直接 hang
到 timeout,proxy 只放行部分 management plane)。呢個檢查係本地替代 —— 唔證明 Azure
接受該 template,但證明 template 內部自洽。CH-012 嘅 A1 就係用佢。

每一項壞咗都會變紅(已用 fails-before 驗過:打錯 secretRef / 未宣告 param /
範本漏必填 / bicep 少一個 env,四種都 detect 到):

  1. JSON parse
  2. 每個 parameters('X') 引用都有對應宣告,而且冇宣告咗但冇用嘅
  3. 每個 secretRef 都有對應 secret,同一個 container app 內
  4. 冇 defaultValue 嘅 parameter 必須喺 params 範本出現
  5. params 範本冇 template 唔認識嘅 key
  6. aca.bicep 同 aca.json 嘅 api env 名一致(兩份要同步 —— aca.json 係部署嗰個)
  7. params 範本冇真 secret(H4)

⚠️ 呢個檢查**唔會**發現 aca.bicep 已知嘅兩處 drift(缺 allowInsecure、API_UPSTREAM
形式唔同)—— 佢只比較 env 名。見 aca.bicep header。
"""

import json
import re
import sys
from pathlib import Path

DEPLOY = Path(__file__).resolve().parent
fails: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {msg}")
    if not cond:
        fails.append(msg)


print("[1] parse")
try:
    tpl = json.loads((DEPLOY / "aca.json").read_text(encoding="utf-8"))
    prm = json.loads((DEPLOY / "aca.params.example.json").read_text(encoding="utf-8"))
    check(True, "aca.json + aca.params.example.json 都 parse 得")
except Exception as e:  # noqa: BLE001 — 任何 parse 失敗都要即刻停
    print(f"  FAIL  parse: {e}")
    sys.exit(1)

declared = set(tpl["parameters"])
raw = (DEPLOY / "aca.json").read_text(encoding="utf-8")

print("[2] parameters() 引用 vs 宣告")
referenced = set(re.findall(r"parameters\('([^']+)'\)", raw))
missing = referenced - declared
check(not missing, f"全部 parameters() 引用都有宣告(缺:{sorted(missing) or '無'})")
unused = declared - referenced
check(not unused, f"冇宣告咗但冇用嘅 parameter(多餘:{sorted(unused) or '無'})")

print("[3] secretRef vs secrets(逐個 container app)")
for res in tpl["resources"]:
    if res["type"] != "Microsoft.App/containerApps":
        continue
    secrets = {s["name"] for s in res["properties"]["configuration"].get("secrets", [])}
    refs = {
        e["secretRef"]
        for c in res["properties"]["template"]["containers"]
        for e in c.get("env", [])
        if "secretRef" in e
    }
    dangling = refs - secrets
    check(not dangling, f"{res['name']}: secretRef 全部有對應 secret(懸空:{sorted(dangling) or '無'})")

print("[4] 冇 default 嘅 parameter 必須喺 params 範本")
required = {k for k, v in tpl["parameters"].items() if "defaultValue" not in v}
supplied = set(prm["parameters"])
absent = required - supplied
check(not absent, f"必填 parameter 全部有值(缺:{sorted(absent) or '無'})")

print("[5] params 範本冇多餘 key")
extra = supplied - declared
check(not extra, f"範本冇 template 唔認識嘅 key(多餘:{sorted(extra) or '無'})")

print("[6] aca.bicep 同 aca.json 嘅 api env 一致")
bicep = (DEPLOY / "aca.bicep").read_text(encoding="utf-8")
api_res = next(
    r for r in tpl["resources"]
    if r["type"] == "Microsoft.App/containerApps" and "apiName" in r["name"]
)
json_env = {e["name"] for e in api_res["properties"]["template"]["containers"][0]["env"]}
# bicep 嘅 api 段落 = 由開頭到 web resource 之前
api_block = bicep.split("resource web ")[0]
bicep_env = set(re.findall(r"\{\s*name:\s*'([A-Z][A-Z0-9_]*)'", api_block))
check(
    bool(json_env) and bool(bicep_env),
    f"兩邊都真係讀到 env(json {len(json_env)} 個 / bicep {len(bicep_env)} 個)—— 防空集合假 PASS",
)
only_json, only_bicep = json_env - bicep_env, bicep_env - json_env
check(
    not only_json and not only_bicep,
    f"api env 名一致(只喺 json:{sorted(only_json) or '無'} / 只喺 bicep:{sorted(only_bicep) or '無'})",
)

print("[7] params 範本冇真 secret")
prm_raw = (DEPLOY / "aca.params.example.json").read_text(encoding="utf-8")
leaked = [m for m in re.findall(r"accesskey=([^\"<;]{8,})", prm_raw) if "key>" not in m]
check(not leaked, f"冇真 accesskey 洩漏(可疑:{len(leaked)} 個)")
for k, v in prm["parameters"].items():
    val = str(v.get("value", ""))
    if "SECRET" in val:
        check(val.startswith("<"), f"{k} 仍係 placeholder 形式")

print()
print(f"=== {'ALL CHECKS PASSED' if not fails else f'{len(fails)} FAILURE(S)'} ===")
sys.exit(1 if fails else 0)
