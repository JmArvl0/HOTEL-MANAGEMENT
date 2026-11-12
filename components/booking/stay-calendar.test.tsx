// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {StayCalendar} from './stay-calendar';
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true};HTMLDialogElement.prototype.close=function(){this.open=false}});
afterEach(cleanup);
it('applies a complete future range and keeps past dates disabled',()=>{
 const change=vi.fn();render(<StayCalendar checkIn="2027-01-13" checkOut="2027-01-15" today="2027-01-10" onChange={change}/>);
 fireEvent.click(screen.getByRole('button',{name:/Choose stay dates/}));
 expect((screen.getByRole('button',{name:'Saturday, January 9, 2027'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Wednesday, January 20, 2027'}));expect(change).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Saturday, January 23, 2027'}));expect(change).toHaveBeenCalledWith('2027-01-20','2027-01-23');
 expect(screen.queryByText('Choose your check-out date')).toBeNull();
});
it('cancelling an unfinished range leaves the current stay untouched',()=>{
 const change=vi.fn();render(<StayCalendar checkIn="2027-01-13" checkOut="2027-01-15" today="2027-01-10" onChange={change}/>);
 fireEvent.click(screen.getByRole('button',{name:/Choose stay dates/}));fireEvent.click(screen.getByRole('button',{name:'Wednesday, January 20, 2027'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(change).not.toHaveBeenCalled();
});
