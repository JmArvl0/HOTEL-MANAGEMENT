import { describe, expect, it } from "vitest";
import { duplicateCandidates } from "./guest-duplicates";
describe("conservative guest identity review", () => {
  it("never matches shared name or phone alone", () => {
    expect(duplicateCandidates([{id:"a",name:"Family",phone:"123"},{id:"b",name:"Family",phone:"123"}])).toEqual([]);
  });
  it("normalizes exact email evidence but protects separate login accounts", () => {
    const rows=duplicateCandidates([{id:"a",name:"Ana",email:" ANA@example.invalid ",user_account_id:"u1"},{id:"b",name:"Ana",email:"ana@example.invalid",user_account_id:"u2"}]);
    expect(rows).toHaveLength(1);expect(rows[0].protected).toBe(true);expect(rows[0].evidence).not.toContain("ana@example.invalid");
  });
  it("retains review decisions and stable pair identity without altering guests", () => {
    const guests=[{id:"b",name:"A",email:"a@example.invalid"},{id:"a",name:"A",email:"a@example.invalid"}];
    const before=JSON.stringify(guests);
    expect(duplicateCandidates(guests,{"a:b":"do_not_merge"})[0].decision).toBe("do_not_merge");
    expect(JSON.stringify(guests)).toBe(before);
  });
});
