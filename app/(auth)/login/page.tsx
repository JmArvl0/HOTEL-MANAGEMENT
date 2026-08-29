import LoginForm from "@/components/auth/login-form";
import { safeInternalPath } from "@/lib/booking";
export default async function LoginPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const params=await searchParams;const callbackUrl=safeInternalPath(params.callbackUrl,"/auth/continue");return <LoginForm callbackUrl={callbackUrl} booking={params.booking==="1"}/>;}