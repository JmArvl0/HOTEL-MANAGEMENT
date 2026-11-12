import { HotelHome, websiteHomeMetadata } from "@/components/landing/hotel-home";

export const revalidate = 300;
export const generateMetadata = websiteHomeMetadata;
export default async function LandingPage() { return <HotelHome />; }
