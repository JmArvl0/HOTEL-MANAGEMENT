import 'server-only';
import { supabase } from '@/lib/supabase';
import type { SearchInput } from '@/lib/booking';
export type ExactRoom = { id: string; number: string; floor: number; available: boolean; amenities: string[]; amenity_additions: string[]; amenity_exclusions: string[] };
export async function getExactRooms(type: string, stay: SearchInput, hold?: string, user?: string): Promise<ExactRoom[]> {
  if (!supabase) throw new Error('Live rooms unavailable');
  const {data,error}=await supabase.rpc('guest_room_choices_with_amenities',{p_type:type,p_in:stay.checkIn,p_out:stay.checkOut,p_hold:hold??null,p_user:user??null});
  if(error) throw new Error('Live rooms unavailable');
  return ((data??[]) as ExactRoom[]).sort((a,b)=>Number(b.available)-Number(a.available)||a.number.localeCompare(b.number,undefined,{numeric:true}));
}
