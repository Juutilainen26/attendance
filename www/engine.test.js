/* node engine.test.js 로 실행 */
var E = require("./engine.js");
var fail = 0, pass = 0;
function eq(name, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.log("  FAIL " + name + "\n    got : " + JSON.stringify(got) + "\n    want: " + JSON.stringify(want)); }
}
function D(s) { return E.parseYmd(s); }

console.log("[1] 기간 산출 (매달 15일 시작)");
var p = E.getPeriod(15, D("2026-07-21"), 0);
eq("현재 회차", [E.ymd(p.start), E.ymd(p.end)], ["2026-07-15", "2026-08-14"]);
p = E.getPeriod(15, D("2026-07-10"), 0);
eq("시작일 전이면 지난달", [E.ymd(p.start), E.ymd(p.end)], ["2026-06-15", "2026-07-14"]);
p = E.getPeriod(15, D("2026-07-21"), 1);
eq("다음 회차", [E.ymd(p.start), E.ymd(p.end)], ["2026-08-15", "2026-09-14"]);
p = E.getPeriod(31, D("2026-02-10"), 0);
eq("31일 시작 → 짧은 달 보정", [E.ymd(p.start), E.ymd(p.end)], ["2026-01-31", "2026-02-27"]);
p = E.getPeriod(1, D("2026-12-05"), 0);
eq("연말 넘김", [E.ymd(p.start), E.ymd(p.end)], ["2026-12-01", "2026-12-31"]);

console.log("[2] 공휴일 인식");
eq("2026-02-17 설날", E.isHoliday(D("2026-02-17")), true);
eq("2026-08-17 광복절 대체", E.isHoliday(D("2026-08-17")), true);
eq("2026-06-03 지방선거", E.isHoliday(D("2026-06-03")), true);
eq("2026-07-21 평일", E.isHoliday(D("2026-07-21")), false);
eq("2026-07-21 영업일", E.isBusinessDay(D("2026-07-21")), true);
eq("2026-07-19 일요일", E.isBusinessDay(D("2026-07-19")), false);

console.log("[3] 영업일 수");
// 2026-07-01 ~ 2026-07-31 : 평일 23일, 공휴일 없음
var r = E.calculate({ startDay: 1, threshold: 80, marks: {} }, D("2026-07-21"), 0);
eq("7월 영업일", r.totalBiz, 23);
eq("결근 없으면 100%", r.rate, 100);
eq("한도 20%", r.budget, 4.6);
// 2026-09-01 ~ 09-30 : 평일 22일 중 추석 9/24,9/25,9/28 3일 공휴일 → 19일
var r2 = E.calculate({ startDay: 1, threshold: 80, marks: {} }, D("2026-09-10"), 0);
eq("9월 영업일(추석 제외)", r2.totalBiz, 19);

console.log("[4] 가중치 계산");
var r3 = E.calculate({ startDay: 1, threshold: 80, marks: {
  "2026-07-06": "absent",   // 1.00
  "2026-07-07": "late",     // 0.33
  "2026-07-08": "early",    // 0.33
  "2026-07-09": "both"      // 0.66
} }, D("2026-07-21"), 0);
eq("사용량 합계", r3.used, 2.32);
eq("출석률", r3.rate, Math.round(((23 - 2.32) / 23) * 10000) / 100);
eq("남은 여유", r3.left, Math.round((4.6 - 2.32) * 100) / 100);
eq("80% 유지", r3.safe, true);

console.log("[5] 주말·공휴일 체크는 무시되는가");
var r4 = E.calculate({ startDay: 1, threshold: 80, marks: {
  "2026-07-04": "absent",  // 토요일
  "2026-07-05": "absent"   // 일요일
} }, D("2026-07-21"), 0);
eq("주말 결근은 미반영", r4.used, 0);

console.log("[6] 80% 붕괴 감지");
var r5 = E.calculate({ startDay: 1, threshold: 80, marks: {
  "2026-07-06": "absent", "2026-07-07": "absent", "2026-07-08": "absent",
  "2026-07-09": "absent", "2026-07-10": "absent"
} }, D("2026-07-21"), 0);
eq("5일 결근 = 미달", r5.safe, false);
eq("여유 음수", r5.left, Math.round((4.6 - 5) * 100) / 100);
eq("표시용 여유는 0", r5.leftCapped, 0);

console.log("[7] 개인 휴무일(회사 휴무) 제외");
var r6 = E.calculate({ startDay: 1, threshold: 80, marks: {}, customOff: ["2026-07-06", "2026-07-07"] }, D("2026-07-21"), 0);
eq("영업일 2일 감소", r6.totalBiz, 21);

console.log("");
console.log(fail === 0 ? "전체 통과: " + pass + "건" : "실패 " + fail + "건 / 통과 " + pass + "건");
process.exit(fail === 0 ? 0 : 1);
