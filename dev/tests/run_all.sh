#!/usr/bin/env bash
# 또박 테스트 전부 돌리기: 빌드 → 알림 서버 단위 테스트 → 화면 테스트(Playwright, 헤드리스 Chromium)
# 준비: pip install playwright (브라우저는 환경에 있는 Chromium 사용), cd dev/tests && npm install
set -u
cd "$(dirname "$0")"
python3 ../build.py >/dev/null || { echo "빌드 실패"; exit 1; }
[ -d node_modules ] || npm install --silent >/dev/null 2>&1
fail=0
# 출력에 FAIL이 있거나 node가 오류로 끝나면(크래시 포함) 실패로 친다
echo "== worker.test.mjs"; r=$(node worker.test.mjs 2>&1); c=$?
if [ $c -ne 0 ] || echo "$r" | grep -q "FAIL"; then echo "FAIL"; echo "$r" | grep -E "FAIL|Error" | head -5; fail=1; else echo "PASS"; fi
echo "== push_events.test.mjs"; node push_events.test.mjs || fail=1
echo "== archive.test.mjs"; node archive.test.mjs || fail=1
for t in test_*.py; do
  r=$(timeout 300 python3 "$t" 2>&1); c=$?
  if [ $c -ne 0 ] || echo "$r" | grep -q "Traceback\|errors: \[.\+\]\|AssertionError"; then echo "== $t FAIL"; echo "$r" | tail -5; fail=1; else echo "== $t PASS"; fi
done
exit $fail
