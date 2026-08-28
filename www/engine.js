/* ===========================================================
   출석률 계산 엔진
   - 결근(하루 통째) = 1일
   - 지각 / 조퇴 = 3회당 정확히 1일
     (0.33씩 더하면 3회에 0.99가 되므로, 횟수를 정수로 세어
      마지막에 한 번만 3으로 나눈다. 3회 = 1.0, 6회 = 2.0)
   - 영업일 = 평일(월~금) 중 법정공휴일 제외
   =========================================================== */

var TARDY_PER_DAY = 3;   // 지각·조퇴 몇 회를 1일로 칠 것인가

// 한국 법정공휴일 (대체공휴일 포함). MMDD 형식.
var HOLIDAYS = {
  "2025": ["0101","0128","0129","0130","0301","0303","0505","0506","0606","0815","1003","1005","1006","1007","1008","1009","1225"],
  "2026": ["0101","0216","0217","0218","0301","0302","0505","0524","0525","0603","0606","0815","0817","0924","0925","0926","1003","1005","1009","1225"],
  "2027": ["0101","0206","0207","0208","0209","0210","0301","0505","0513","0606","0815","0816","0914","0915","0916","1003","1004","1009","1011","1225","1227"],
  "2028": ["0101","0126","0127","0128","0301","0502","0505","0606","0815","1002","1003","1004","1005","1009","1225"],
  "2029": ["0101","0212","0213","0214","0301","0505","0507","0520","0521","0606","0815","0921","0922","0923","0924","0925","1003","1009","1225"],
  "2030": ["0101","0202","0203","0204","0205","0206","0301","0505","0506","0509","0606","0815","0911","0912","0913","1003","1009","1225"],
  "2031": ["0101","0122","0123","0124","0301","0303","0505","0528","0606","0815","0930","1001","1002","1003","1009","1225"]
};

// d = 결근 일수, t = 지각·조퇴 횟수
var MARK_UNITS = {
  none:   { d: 0, t: 0 },
  absent: { d: 1, t: 0 },
  late:   { d: 0, t: 1 },
  early:  { d: 0, t: 1 },
  both:   { d: 0, t: 2 }
};
var MARK_LABEL = { absent: "결근", late: "지각", early: "조퇴", both: "지각+조퇴" };
var MARK_CYCLE = ["none", "absent", "late", "early", "both"];

function pad2(n) { return (n < 10 ? "0" : "") + n; }
function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function parseYmd(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); } // m: 0-based

function isHoliday(d) {
  var list = HOLIDAYS[String(d.getFullYear())];
  if (!list) return false;
  return list.indexOf(pad2(d.getMonth() + 1) + pad2(d.getDate())) !== -1;
}

// 영업일 여부: 평일 + 공휴일 아님 + 사용자가 지정한 개인 휴무일 아님
function isBusinessDay(d, customOff) {
  var w = d.getDay();
  if (w === 0 || w === 6) return false;
  if (isHoliday(d)) return false;
  if (customOff && customOff.indexOf(ymd(d)) !== -1) return false;
  return true;
}

/* 매달 startDay(1~31)에 시작하는 회차 기간을 구한다.
   offset: 0 = 오늘이 속한 회차, -1 = 이전 회차, +1 = 다음 회차
   반환: {start: Date, end: Date}  (end 포함) */
function getPeriod(startDay, baseDate, offset) {
  offset = offset || 0;
  var y = baseDate.getFullYear(), m = baseDate.getMonth();
  var anchorDay = Math.min(startDay, daysInMonth(y, m));
  // 이번 달 시작일이 아직 안 왔으면 지난달이 현재 회차
  if (baseDate.getDate() < anchorDay) m -= 1;
  m += offset;
  var sy = y + Math.floor(m / 12), sm = ((m % 12) + 12) % 12;
  var start = new Date(sy, sm, Math.min(startDay, daysInMonth(sy, sm)));
  var nm = sm + 1, ny = sy;
  if (nm > 11) { nm = 0; ny += 1; }
  var nextStart = new Date(ny, nm, Math.min(startDay, daysInMonth(ny, nm)));
  return { start: start, end: addDays(nextStart, -1) };
}

function eachDay(start, end, fn) {
  for (var d = new Date(start.getTime()); d <= end; d = addDays(d, 1)) fn(d);
}

/* 핵심 계산
   schedule: {startDay, threshold, marks:{ "YYYY-MM-DD": "absent"|"late"|"early"|"both" }, customOff:[]}
*/
function calculate(schedule, baseDate, offset) {
  var p = getPeriod(schedule.startDay, baseDate, offset);
  var th = (schedule.threshold == null ? 80 : schedule.threshold) / 100;
  var off = schedule.customOff || [];
  var marks = schedule.marks || {};

  var total = 0, absentDays = 0, tardyCount = 0, elapsedBiz = 0, remainBiz = 0;
  var today = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());

  eachDay(p.start, p.end, function (d) {
    if (!isBusinessDay(d, off)) return;
    total += 1;
    var u = MARK_UNITS[marks[ymd(d)]];
    if (u) { absentDays += u.d; tardyCount += u.t; }
    if (d <= today) elapsedBiz += 1; else remainBiz += 1;
  });

  // 정수로 모아서 마지막에 한 번만 나눈다 → 3회는 정확히 1.0
  var used = absentDays + tardyCount / TARDY_PER_DAY;

  var rate = total === 0 ? 100 : ((total - used) / total) * 100;
  var budget = total * (1 - th);             // 이 회차에 쓸 수 있는 총 결근 한도
  var left = budget - used;                  // 앞으로 더 쉴 수 있는 일수
  var cappedLeft = Math.min(left, remainBiz); // 남은 영업일보다 많이 쉴 수는 없음

  return {
    start: p.start, end: p.end,
    totalBiz: total,
    elapsedBiz: elapsedBiz,
    remainBiz: remainBiz,
    absentDays: absentDays,
    tardyCount: tardyCount,
    used: Math.round(used * 100) / 100,
    usedExact: used,
    rate: Math.round(rate * 100) / 100,
    budget: Math.round(budget * 100) / 100,
    left: Math.round(left * 100) / 100,
    leftExact: left,
    leftCapped: Math.round(Math.max(0, cappedLeft) * 100) / 100,
    // 남은 여유를 지각·조퇴 횟수로 환산 (버림)
    leftTardyCount: Math.floor(Math.max(0, left) * TARDY_PER_DAY + 1e-9),
    safe: rate >= (th * 100) - 1e-9,
    threshold: th * 100
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HOLIDAYS: HOLIDAYS, MARK_UNITS: MARK_UNITS, MARK_CYCLE: MARK_CYCLE, MARK_LABEL: MARK_LABEL,
    TARDY_PER_DAY: TARDY_PER_DAY,
    ymd: ymd, parseYmd: parseYmd, addDays: addDays, isHoliday: isHoliday, isBusinessDay: isBusinessDay,
    getPeriod: getPeriod, calculate: calculate, daysInMonth: daysInMonth, pad2: pad2 };
}
