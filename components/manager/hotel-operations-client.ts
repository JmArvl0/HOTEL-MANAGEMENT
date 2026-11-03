"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import "./hotel-operations.css";
export async function hotelRequest<T>(url:string,body?:unknown,method="POST"):Promise<T>{
 const response=await fetch(url,body===undefined?{cache:"no-store"}:{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error??"Hotel operations are temporarily unavailable.");
 if(!("data" in result))throw new Error("The hotel response was incomplete. Refresh and try again.");
 return result.data as T;
}
export function useHotelResource<T>(url:string){
 const[data,setData]=useState<T|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const sequence=useRef(0);
 const refresh=useCallback(async()=>{const request=++sequence.current;setLoading(true);setError("");try{const next=await hotelRequest<T>(url);if(request===sequence.current)setData(next);}catch(e){if(request===sequence.current)setError(e instanceof Error?e.message:"Unable to load hotel operations.");}finally{if(request===sequence.current)setLoading(false);}},[url]);
 useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>{window.clearTimeout(timer);sequence.current++;};},[refresh]);
 return{data,error,loading,refresh,setData};
}
