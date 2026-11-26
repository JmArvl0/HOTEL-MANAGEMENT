const detail = {
  briefing: {
    module: 'Hotel Operations',
    title: 'Shift briefing',
    description: 'Wednesday, 11 November 2026 · 1:15 PM Manila',
    records: [
      ['Maintenance', 'Keep Room 306 out of service while the bathroom leak is isolated.'],
      ['Front Desk', 'Assign four arrivals before the first guest arrives at 2:00 PM. Seven rooms are ready.'],
      ['Management', 'Review three pending approvals. The oldest request was filed at 11:15 AM.'],
      ['Housekeeping and Guest Services', 'Follow up on the overdue Room 207 turnover and Room 112 guest request.'],
    ],
  },
  critical: {
    module: 'Maintenance',
    title: 'Critical maintenance',
    description: 'One critical work order needs attention.',
    records: [
      ['WO-0142 · Room 306', 'Bathroom supply line leak. Room blocked at 12:40 PM. Engineering is isolating the supply.'],
    ],
  },
  approvals: {
    module: 'Approvals & Escalations',
    title: '3 pending approvals',
    description: 'Sample cases awaiting a Manager decision, oldest first.',
    records: [
      ['APR-0192 · Room-type exception', 'Front Desk · Requested at 11:15 AM'],
      ['APR-0193 · Late checkout exception', 'Front Desk · Requested at 11:40 AM'],
      ['APR-0194 · Service recovery credit', 'Guest Services · Requested at 12:35 PM'],
    ],
  },
  unassigned: {
    module: 'Bookings',
    title: '4 arrivals need rooms',
    description: 'Unassigned reservations ordered by expected arrival time.',
    records: [
      ['HV-2081 · Garden Twin', 'Expected at 2:00 PM'],
      ['HV-2085 · Deluxe King', 'Expected at 2:30 PM'],
      ['HV-2092 · Garden Twin', 'Expected at 3:00 PM'],
      ['HV-2096 · Haven Suite', 'Expected at 4:15 PM'],
    ],
  },
  overdue: {
    module: 'Housekeeping and Guest Requests',
    title: '2 overdue service tasks',
    description: 'Both sample tasks are past their recorded due time.',
    records: [
      ['HK-056 · Room 207 turnover', 'Housekeeping · Due at 12:30 PM'],
      ['GR-084 · Extra towels for Room 112', 'Guest Requests · Due at 1:00 PM'],
    ],
  },
  arrivals: {
    module: 'Bookings',
    title: '12 arrivals today',
    description: 'Three guests have checked in. Nine arrivals are still expected.',
    records: [
      ['5 assigned arrivals', 'Room assignments are recorded. Check-in is pending.'],
      ['4 unassigned arrivals', 'First expected at 2:00 PM. A room assignment is required for each reservation.'],
    ],
  },
  departures: {
    module: 'Bookings',
    title: '9 departures today',
    description: 'Six guests have checked out. Three departures are still due.',
    records: [
      ['Room 218 · Garden Twin', 'Late checkout scheduled for 2:00 PM'],
      ['Room 312 · Deluxe King', 'Late checkout scheduled for 2:30 PM'],
      ['Room 402 · Haven Suite', 'Late checkout scheduled for 3:00 PM'],
    ],
  },
  occupied: {
    module: 'Room Management',
    title: '36 occupied rooms',
    description: '75% of the hotel’s 48 rooms are occupied at the sample snapshot.',
    records: [
      ['33 continuing stays', 'These rooms have no departure remaining today.'],
      ['3 departures still due', 'Rooms 218, 312 and 402 are occupied until checkout.'],
    ],
  },
  ready: {
    module: 'Room Management',
    title: '7 rooms ready to assign',
    description: 'These vacant rooms are clean and serviceable.',
    records: [
      ['Garden Twin · 3 rooms', 'Rooms 103, 105 and 204'],
      ['Deluxe King · 3 rooms', 'Rooms 208, 301 and 303'],
      ['Haven Suite · 1 room', 'Room 401'],
    ],
  },
  dirty: {
    module: 'Room Management',
    title: '3 rooms awaiting housekeeping',
    description: 'Vacant rooms still awaiting turnover.',
    records: [
      ['Room 207 · Garden Twin', 'Turnover was due at 12:30 PM.'],
      ['Room 219 · Garden Twin', 'Housekeeping scheduled for 1:45 PM.'],
      ['Room 309 · Deluxe King', 'Housekeeping scheduled for 2:15 PM.'],
    ],
  },
  blocked: {
    module: 'Room Management',
    title: '2 rooms out of service',
    description: 'Both rooms are blocked from assignment.',
    records: [
      ['Room 306 · Deluxe King', 'WO-0142 · Bathroom supply line leak'],
      ['Room 314 · Deluxe King', 'WO-0137 · Air conditioning repair'],
    ],
  },
};

function paintIcons(root) {
  for (const icon of root.querySelectorAll('[data-icon]')) {
    icon.innerHTML = window.HAVEN_ICONS[icon.dataset.icon];
  }
}

const theme = document.querySelector('#theme');
theme.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  theme.setAttribute('aria-pressed', String(dark));
  theme.querySelector('[data-icon]').dataset.icon = dark ? 'Sun' : 'Moon';
  paintIcons(theme);
});

const financeVisibility = document.querySelector('#finance-visibility');
const financeAmounts = document.querySelectorAll('#finance-amounts [data-amount]');
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function showFinanceAmounts(visible) {
  financeVisibility.setAttribute('aria-pressed', String(visible));
  financeVisibility.title = visible ? 'Hide financial amounts' : 'Show financial amounts';
  for (const field of financeAmounts) {
    const amount = peso.format(Number(field.dataset.amount));
    const firstDigit = amount.search(/\d/);
    field.textContent = visible ? amount : amount.replace(/\d/g, (digit, index) => index === firstDigit ? digit : '*');
  }
}

financeVisibility.addEventListener('click', () => {
  showFinanceAmounts(financeVisibility.getAttribute('aria-pressed') === 'false');
});
showFinanceAmounts(false);

const filters = document.querySelectorAll('[data-filter]');
const queueRows = document.querySelectorAll('[data-category]');
const filterResult = document.querySelector('#filter-result');
for (const button of filters) {
  button.addEventListener('click', () => {
    for (const filter of filters) filter.setAttribute('aria-pressed', String(filter === button));
    const category = button.dataset.filter;
    let visible = 0;
    for (const row of queueRows) {
      row.hidden = category !== 'all' && row.dataset.category !== category;
      if (!row.hidden) visible += 1;
    }
    filterResult.textContent = visible === 1 ? '1 queue shown' : `${visible} queues shown`;
  });
}

const details = document.querySelector('#details');
for (const trigger of document.querySelectorAll('[data-detail]')) {
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.addEventListener('click', () => {
    const { module, title, description, records } = detail[trigger.dataset.detail];
    document.querySelector('#detail-context').textContent = `${module} · Sample data`;
    document.querySelector('#detail-title').textContent = title;
    document.querySelector('#detail-description').textContent = description;
    document.querySelector('#detail-records').replaceChildren(...records.map(([name, note]) => {
      const row = document.createElement('li');
      const label = document.createElement('strong');
      const caption = document.createElement('small');
      label.textContent = name;
      caption.textContent = note;
      row.append(label, caption);
      return row;
    }));
    details.showModal();
  });
}

const periods = {
  current: { start: '2026-11-05', rooms: [31, 35, 39, 40, 37, 36, 36] },
  previous: { start: '2026-10-29', rooms: [28, 30, 33, 36, 37, 34, 32] },
};
const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const period = document.querySelector('#period');
const bars = document.querySelector('#bars');
const average = document.querySelector('#average');

function drawChart() {
  const { start, rooms } = periods[period.value];
  const totalRoomNights = rooms.reduce((sum, count) => sum + count, 0);
  average.textContent = `${Math.round(totalRoomNights / (48 * rooms.length) * 100)}%`;
  bars.replaceChildren(...rooms.map((count, index) => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const share = Math.round(count / 48 * 100);
    const item = document.createElement('li');
    const bar = document.createElement('span');
    const value = document.createElement('strong');
    const day = document.createElement('time');
    bar.className = 'bar';
    bar.style.setProperty('--share', share);
    value.textContent = `${share}%`;
    bar.append(value);
    day.dateTime = date.toISOString().slice(0, 10);
    day.textContent = dateLabel.format(date);
    if (day.dateTime === '2026-11-11') bar.classList.add('today');
    item.append(bar, day);
    return item;
  }));
}

const navLinks = document.querySelectorAll('.sidebar nav a');
function markSection() {
  const target = location.hash || '#overview';
  for (const link of navLinks) {
    if (link.hash === target) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

period.addEventListener('change', drawChart);
window.addEventListener('hashchange', markSection);
paintIcons(document);
drawChart();
markSection();
