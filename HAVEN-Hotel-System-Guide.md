# Haven Hotel Management System — Simple Guide for Classmates

**What is Haven?**
Haven Makati is a small boutique hotel system (~48 rooms) in one website.
Guests can browse rooms and book online. Staff use the same system to run
the whole hotel day: check-in, cleaning, repairs, requests, rides, payments,
and reports. Everything is connected — one booking flows through everyone
until checkout.

No technical knowledge needed to understand this guide.

---

## Part 1: How the system works, start to finish

Think of it like a guest's real journey through a hotel:

### 1. Guest looks at rooms
Anyone can open the website, see room types, photos, prices, and amenities.
No login needed just to look around.

### 2. Guest books online
A guest creates an account, picks dates and number of guests, chooses
a room type, and fills in contact details.

They can also add at this point:
- Special requests (extra pillows, early arrival, etc.)
- A ride request (airport pickup, drop-off, round-trip)

The system holds their choice for 15 minutes while they finish payment.
If they don't pay in time, the hold expires and the room goes back on sale.

### 3. Guest pays the deposit with proof
There is no online card payment. The guest pays manually via GCash or
bank transfer, then uploads:
1. The transaction reference number, AND
2. A screenshot/photo of the proof of payment

Both are required. Staff will check it manually.

### 4. Accounting confirms the booking
The Accounting team checks the proof and amount:
- If correct → booking becomes **Confirmed**
- If wrong → rejected with a reason, guest can fix it

Once confirmed, the system automatically:
- Files the guest's special requests
- Files the ride request if they asked for one
- Sends the guest a notification (and email if enabled)

### 5. Before arrival
- Guest gets an automatic reminder ~1 day before check-in
  (room type, check-in time, ride schedule if any)
- Front Desk sees the guest in "Arrivals Today"
- If a request needs a different room type, Front Desk asks the Manager
  for approval first

### 6. Check-in day
Front Desk does 3 checks:
1. Guest shows a valid ID
2. Balance/deposit is settled
3. A clean, working room of the right type is ready

Then they assign a physical room (e.g. Room 204) and check the guest in.
The guest's status becomes **Checked-in**.

If no room of the booked type is free, Front Desk can't just pick anything —
they request a room-type exception from the Manager.

### 7. During the stay
The guest can, from their own account:
- See their booking and bill
- Ask for things (towels, cleaning, repair) — sent as a group/batch
- Request or cancel a ride
- Pay remaining balance (again with proof screenshot)
- See receipts and notifications
- After checkout, leave **one review per stay** (1–5 stars + comment) —
  it appears on the homepage Guest stories section

Behind the scenes:
- **Front Desk** approves guest request batches, then routes them:
  cleaning → Housekeeping, broken item → Maintenance, etc.
- **Housekeeping** cleans, marks room ready, passes inspection
- **Maintenance** fixes things. If a room is badly broken, they block it
  so it can't be sold until fixed.
- **Front Desk** runs the rides: review → schedule → assign driver →
  start trip → complete. Fare is added to the guest's bill when a driver
  is assigned.
- **Accounting** verifies any new payments, posts charges, handles refunds,
  opens/closes cash shifts, and issues receipts/folios.

If something unusual happens (upgrade, early check-in, late checkout,
extra nights, discount/compensation, refund outside the normal rule),
staff file a **Manager Approval**. The Manager approves or rejects,
then Front Desk or Accounting carries it out.

### 8. Check-out day
- Guest gets a reminder ~1 day before checkout (time, balance left, ride)
- Front Desk checks that the bill is fully paid (no balance left)
- Then they check the guest out
- The room automatically becomes **Dirty** and a cleaning task is created
- Housekeeping cleans it → inspection → room becomes sellable again

### 9. End of day — Reports (different per role)
Yes — Front Desk, Manager, Accounting, Admin, and Owner all have Reports,
but each sees a different one:

- **Front Desk:** Daily Operations Report — creates and submits it
  (arrivals, departures, payments, cleaning done, rides, issues).
- **Manager:** Two views — Performance Center (occupancy, collections,
  readiness, 7-day chart) + reviews the Front Desk daily report
  (Acknowledge or Return for correction).
- **Accounting:** Performance view (money-focused) — no daily-report submit.
- **Admin:** Admin Reports — accounts by role + room/policy setup summary only.
  No sales or operations numbers.
- **Owner:** Executive Reports — 7-day summary (occupancy, net revenue,
  blocked rooms, pending owner decisions).

Housekeeping, Maintenance, and Guest have no Reports tab.

### 10. If guest cancels or doesn't show up
- Guest can cancel from their account or ask staff
- Refund follows the hotel's cancellation rule automatically:
  early cancel = full refund, closer to arrival = half or none
- Normal refunds go straight to Accounting — no Manager needed
- Only if someone asks for MORE than the rule allows does the Manager
  need to approve an exception
- If guest just never arrives past midnight, Front Desk marks **No-show**

That's the full loop: Browse → Book → Pay proof → Confirm → Check-in →
Stay → Check-out → Clean → Report.

---

## Part 2: What does each role do?

There are 8 roles. One login, system shows you only your workspace.

### 1. Guest (the customer)
The person staying at the hotel.
- Browse rooms, book online, upload payment proof
- View/cancel/change own bookings, pay balance
- Request cleaning items, repairs, rides
- Get notifications, reminders, receipts
- Cannot see other guests or staff tools

*In short: books, pays, requests, stays.*

### 2. Front Desk (the reception)
The face of the hotel, runs arrivals and departures daily.
- Create walk-in / phone bookings
- Assign rooms, check guests in and out
- Collect payments and add charges to the bill
- Approve guest request batches and route them
- Run the rides (schedule, assign driver, start/complete)
- Ask Manager for approval when rules need an exception
- Submit the daily operations report
- Can VIEW deposit proofs list but CANNOT approve money — that's Accounting

*In short: welcomes guests, manages rooms and rides, keeps the day moving.*

### 3. Housekeeping (the cleaning team)
Keeps rooms clean and ready.
- See cleaning tasks in a queue: Needs attention → My tasks → In progress →
  Waiting for inspection → Done today
- Assign to self, start, complete, pass/fail inspection
- Report a broken item (creates a Maintenance job, doesn't block room themselves)
- Handle guest cleaning requests
- System can SUGGEST who should take which task, but a person always confirms

*In short: cleans, inspects, makes rooms sellable again.*

### 4. Maintenance (the fixers)
Keeps everything working.
- See repair jobs: Open → Assigned → In progress → Resolved → Completed
- Assign to self, diagnose the problem, fix it
- Decide if a room is still usable or must be blocked from sale
- Unblock the room when fixed (creates a cleaning task after)
- Register hotel equipment (aircon, generator, etc.) and record servicing.
  An overdue service NEVER blocks a room by itself — only a real breakdown does.

*In short: fixes, blocks broken rooms, unblocks when safe.*

### 5. Accounting (the money approvers)
The ONLY role that can say "this payment is valid."
- Verify deposit and stay-payment proofs (approve/reject)
- Post adjustments, process refunds, accept overpayments
- Open/close cash shifts, reconcile cash, issue receipts and folios
- See how long deposits have waited (aging chips: attention / past SLA)
- Executes money-related Manager approvals (e.g. compensation credit)

*In short: owns the money truth. Front Desk collects, Accounting confirms.*

### 6. Manager (the supervisor)
Handles exceptions and watches operations, not routine money.
- Approve/reject staff exception requests (upgrade, early check-in,
  late checkout, extra nights, changes, compensation, refund exceptions)
- Watch all reservations needing attention
- Review Front Desk daily reports
- Manage room types content/photos/visibility + propose prices
  (but cannot set the price alone — Owner/Admin must approve)
- Manage rides catalogue, inventory, staff-on-duty view, forecasts/AI insights
- Can cancel/reject a ride, but cannot drive the ride steps like Front Desk
- Can see assignment suggestions but cannot assign cleaning tasks directly

*In short: decides exceptions, supervises the floor, approves what rules forbid.*

### 7. Admin (the system caretaker)
Takes care of accounts and setup, not guests.
- Create staff accounts, activate/suspend, change roles
- Help with account recovery (forgotten access)
- Edit rooms, room types, hotel policies (times, deposit %, refund rules,
  tax rates)
- Check system health (database, activity, updates)
- Cannot do Front Desk/Housekeeping/Maintenance daily work

*In short: manages users, rooms setup, and policies.*

### 8. Owner (the boss)
Top-level view + final say on big exceptions.
- See executive data and reports
- Final approval for critical exceptions escalated by Manager
- Approve room prices and rate plans proposed by Manager
- View rooms, rides, policies read-only (doesn't operate daily tasks)
- Manage catalogue like Admin

*In short: approves prices, decides escalated cases, watches the business.*

---

## Quick cheat-sheet

| Question | Answer |
|---|---|
| Who confirms my GCash payment? | Accounting only |
| Who checks me in? | Front Desk |
| Who cleans my room? | Housekeeping |
| Who fixes the aircon? | Maintenance |
| Who approves a free upgrade / late checkout? | Manager (Front Desk executes) |
| Who gives me a refund? | Accounting (Manager only if beyond normal rule) |
| Who creates staff accounts? | Admin |
| Who sets room prices? | Manager proposes, Owner/Admin approves |
| Who sees everything? | No one — each role sees only what it needs |

## One rule to remember
**Front Desk moves people. Housekeeping readies rooms. Maintenance keeps rooms usable.
Accounting confirms money. Manager approves exceptions. Admin/Owner govern the system.
Guest just books and enjoys.**

If you remember that, you understand Haven.
