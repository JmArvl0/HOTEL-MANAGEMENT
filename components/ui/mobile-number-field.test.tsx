// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MobileNumberField} from './mobile-number-field';
afterEach(cleanup);
describe('Mobile number country field',()=>{
 it('normalizes PH local and international paste without duplicate code',()=>{
  const {container}=render(<form><MobileNumberField name="phone"/></form>);
  for(const number of ['09170000000','+63 917 000 0000','00639170000000']){
   fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:number}});
   expect((container.querySelector('[name=phone]') as HTMLInputElement).value).toBe('+639170000000');
  }
 });
 it('searches and changes flag and calling code',()=>{
  const {container}=render(<MobileNumberField name="phone" defaultValue="+639170000000"/>);
  fireEvent.click(screen.getByRole('button',{name:/Country calling code/}));
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Singapore'}});
  fireEvent.click(screen.getByRole('button',{name:/Singapore/}));
  expect(screen.getByRole('button',{name:'Country calling code, Singapore (+65)'})).toBeTruthy();
  expect((container.querySelector('[name=phone]') as HTMLInputElement).value).toBe('+659170000000');
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/flags/sg.svg');
 });
 it('rejects an incomplete PH number and allows the complete number',()=>{
  render(<MobileNumberField name="phone"/>);const input=screen.getByLabelText('Mobile number') as HTMLInputElement;
  fireEvent.change(input,{target:{value:'917'}});fireEvent.blur(input);
  expect(input.checkValidity()).toBe(false);expect(screen.getByText(/Enter 10 digits/)).toBeTruthy();
  fireEvent.change(input,{target:{value:'9170000000'}});expect(input.checkValidity()).toBe(true);
 });
});
