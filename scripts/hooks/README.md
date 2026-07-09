# Git Hooks

commit / push 前自動品質檢查。**唔 touch `.git/`**(用 `core.hooksPath` 指向本資料夾)。

## 啟用(一次性)
```
git config core.hooksPath scripts/hooks
```
停用:`git config --unset core.hooksPath`
緊急跳過單次:`git commit --no-verify` / `git push --no-verify`

## 內容
- `pre-commit` — commit 前 lint staged 檔(快)。
- `pre-push` — push 前跑較重檢查(test / type-check)。

## 慣例
- Hook 要**快**(pre-commit 尤其),否則開發者會習慣 `--no-verify`。
- 只 lint **staged / 改動** 嘅檔,唔好全庫掃。
- {填你 stack 嘅 lint / test 命令}。
