import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const home=readFileSync('components/landing/hotel-home.tsx','utf8');
const hero=readFileSync('components/landing/hotel-information.tsx','utf8');
const css=readFileSync('components/landing/hotel-information.css','utf8');
const cards=readFileSync('app/(landing-page)/landing.css','utf8');
describe('responsive landing media and booking',()=>{
 it('keeps the booking form outside the photographic hero and removes resize-sensitive scroll transforms',()=>{
  expect(home.indexOf('<HotelHero')).toBeLessThan(home.indexOf('<HeroBookingForm'));
  expect(home).not.toContain('LandingMotion');
  expect(hero).toContain('className="hotel-hero-image"');
  expect(css).toContain('isolation:isolate');
  expect(css).toContain('.hotel-hero::after');
 });
 it('keeps room shells aligned without animation offsets',()=>{
  expect(cards).toMatch(/\.coast-room-grid\{[^}]*align-items:stretch/);
  expect(cards).toMatch(/\.coast-room-price-row\{[^}]*margin-top:auto/);
  expect(home).not.toContain('gsap');
 });
});
