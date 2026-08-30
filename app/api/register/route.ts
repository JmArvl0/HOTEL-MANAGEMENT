import{NextResponse}from"next/server";import bcrypt from"bcryptjs";import{z}from"zod";import{supabase}from"@/lib/supabase";
const schema=z.object({firstName:z.string().trim().min(1).max(80),lastName:z.string().trim().min(1).max(80),phone:z.string().trim().min(7).max(30),email:z.string().trim().email().max(200),password:z.string().min(8).max(128),confirmPassword:z.string().min(8).max(128)}).refine((value)=>value.password===value.confirmPassword,{message:"Passwords do not match.",path:["confirmPassword"]});
export async function POST(request:Request){
 if(!supabase)return NextResponse.json({error:"Registration is unavailable."},{status:503});
 // Named so an operator can locate a failure from the platform log alone.
 let stage="parse_request";
 try{
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid registration details."},{status:400});
  stage="hash_password";const passwordHash=await bcrypt.hash(parsed.data.password,12);
  stage="register_guest_account";
  const{error}=await supabase.rpc("register_guest_account",{p_first_name:parsed.data.firstName,p_last_name:parsed.data.lastName,p_email:parsed.data.email.toLowerCase(),p_phone:parsed.data.phone,p_password_hash:passwordHash});
  if(error){
   if(error.message.includes("ACCOUNT_EXISTS")||error.code==="23505")return NextResponse.json({error:"An account with this email already exists."},{status:409});
   // The RPC re-validates independently of the schema above. A rejection there is
   // bad caller input, not a server fault, so it must not surface as a 500.
   if(error.message.includes("INVALID_REGISTRATION"))return NextResponse.json({error:"Please check your registration details and try again."},{status:400});
   throw error;
  }
  return NextResponse.json({ok:true},{status:201});
 }catch(cause){
  // Operators need the stage and the database code; the request payload, password,
  // hash and connection details must never reach a log. Postgres `detail` is
  // omitted deliberately because it echoes the offending column values.
  const failure=cause as{code?:string;message?:string};
  console.error(`registration failed: stage=${stage} db_code=${failure?.code??"none"} db_message=${failure?.message??"unknown"}`);
  return NextResponse.json({error:"We could not create your account. Please try again."},{status:500});
 }
}
